const express = require('express');
const XLSX = require('xlsx');
const {
  Document, Packer, Paragraph, Table, TableRow, TableCell, TextRun,
  HeadingLevel, WidthType, AlignmentType, BorderStyle,
} = require('docx');

const { db } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/error');
const { notFound } = require('../lib/http-error');
const perm = require('../lib/permissions');

const router = express.Router();
router.use(authMiddleware);

/**
 * Nome de arquivo seguro para o header Content-Disposition. Sem isso, um título
 * com aspas ou quebra de linha permite injetar headers HTTP na resposta.
 */
function safeFilename(name, fallback) {
  const clean = String(name)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9 _-]/g, '')
    .trim().replace(/\s+/g, '_')
    .slice(0, 60);
  return clean || fallback;
}

/* ===== Excel ===== */

router.get('/excel', asyncHandler(async (req, res) => {
  const { group_id: groupId } = req.query;

  let sql, args;
  if (groupId) {
    await perm.assertGroupMember(groupId, req.user.id);
    sql = `SELECT * FROM recipes
           WHERE group_id = ? AND (is_private = 0 OR user_id = ?)
           ORDER BY title COLLATE NOCASE`;
    args = [groupId, req.user.id];
  } else {
    sql = `SELECT * FROM recipes r
           WHERE r.user_id = ?
              OR (r.group_id IN (SELECT group_id FROM group_members WHERE user_id = ?)
                  AND r.is_private = 0)
           ORDER BY r.title COLLATE NOCASE`;
    args = [req.user.id, req.user.id];
  }

  const result = await db.execute({ sql, args });

  const data = result.rows.map(r => ({
    'Título': r.title,
    'Descrição': r.description,
    'Ingredientes': r.ingredients,
    'Modo de Preparo': r.instructions,
    'Tempo de Preparo (min)': r.prep_time,
    'Tempo de Cozimento (min)': r.cook_time,
    'Porções': r.servings,
    'Categoria': r.category,
    'Dificuldade': r.difficulty || 'Médio',
    'Privada': r.is_private ? 'Sim' : 'Não',
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(data);
  ws['!cols'] = [
    { wch: 30 }, { wch: 40 }, { wch: 50 }, { wch: 50 },
    { wch: 15 }, { wch: 15 }, { wch: 10 }, { wch: 15 }, { wch: 12 }, { wch: 8 },
  ];
  XLSX.utils.book_append_sheet(wb, ws, 'Receitas');

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename=receitas.xlsx');
  res.send(buf);
}));

/* ===== Word ===== */

// Rota mais específica primeiro: /word/group/:id seria capturado por /word/:id.
router.get('/word/group/:groupId', asyncHandler(async (req, res) => {
  await perm.assertGroupMember(req.params.groupId, req.user.id);

  const group = await db.execute({
    sql: 'SELECT name FROM groups_ WHERE id = ?',
    args: [req.params.groupId],
  });
  if (group.rows.length === 0) throw notFound('Grupo não encontrado');

  const recipes = await db.execute({
    sql: `SELECT * FROM recipes
          WHERE group_id = ? AND (is_private = 0 OR user_id = ?)
          ORDER BY title COLLATE NOCASE`,
    args: [req.params.groupId, req.user.id],
  });

  const groupName = group.rows[0].name;
  const doc = new Document({
    title: `Receitas — ${groupName}`,
    sections: [{
      children: [
        new Paragraph({
          text: groupName,
          heading: HeadingLevel.TITLE,
          alignment: AlignmentType.CENTER,
        }),
        new Paragraph({
          children: [new TextRun({
            text: `${recipes.rows.length} receita(s)`,
            italics: true,
            color: '888888',
          })],
          alignment: AlignmentType.CENTER,
          spacing: { after: 600 },
        }),
        ...recipes.rows.flatMap(r => recipeSections(r)),
      ],
    }],
  });

  await sendDocx(res, doc, safeFilename(groupName, 'grupo') + '.docx');
}));

router.get('/word/:id', asyncHandler(async (req, res) => {
  const recipe = await perm.loadRecipeForRead(req.params.id, req.user.id);
  const doc = new Document({
    title: recipe.title,
    sections: [{ children: recipeSections(recipe) }],
  });
  await sendDocx(res, doc, safeFilename(recipe.title, 'receita') + '.docx');
}));

async function sendDocx(res, doc, filename) {
  const buf = await Packer.toBuffer(doc);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
  res.send(buf);
}

/**
 * O app guarda ingredientes como "2 xícaras | farinha" e usa "# Nome" para
 * marcar seções do preparo. O export antigo despejava o texto cru, com os
 * separadores à mostra. Aqui esses marcadores viram formatação de verdade.
 */
function recipeSections(recipe) {
  const items = [
    new Paragraph({
      text: recipe.title,
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 400, after: 160 },
    }),
  ];

  if (recipe.description) {
    items.push(new Paragraph({
      children: [new TextRun({ text: recipe.description, italics: true })],
      spacing: { after: 200 },
    }));
  }

  items.push(infoTable(recipe));

  items.push(new Paragraph({
    text: 'Ingredientes',
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 300, after: 120 },
  }));

  for (const line of splitLines(recipe.ingredients)) {
    const sep = line.indexOf(' | ');
    const runs = sep > 0
      ? [
          new TextRun({ text: line.slice(0, sep), bold: true }),
          new TextRun({ text: '  ' + line.slice(sep + 3) }),
        ]
      : [new TextRun({ text: line })];
    items.push(new Paragraph({ children: runs, bullet: { level: 0 } }));
  }

  items.push(new Paragraph({
    text: 'Modo de Preparo',
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 300, after: 120 },
  }));

  let step = 0;
  for (const line of splitLines(recipe.instructions)) {
    if (line.startsWith('# ')) {
      step = 0;
      items.push(new Paragraph({
        children: [new TextRun({ text: line.slice(2), bold: true })],
        spacing: { before: 200, after: 80 },
      }));
    } else {
      step++;
      items.push(new Paragraph({
        children: [
          new TextRun({ text: `${step}. `, bold: true }),
          new TextRun({ text: line }),
        ],
        spacing: { after: 80 },
      }));
    }
  }

  items.push(new Paragraph({
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'DDDDDD' } },
    spacing: { before: 300, after: 300 },
  }));

  return items;
}

function infoTable(recipe) {
  const rows = [
    ['Tempo de Preparo', `${recipe.prep_time || 0} min`],
    ['Tempo de Cozimento', `${recipe.cook_time || 0} min`],
    ['Porções', String(recipe.servings || 1)],
    ['Categoria', recipe.category || '—'],
    ['Dificuldade', recipe.difficulty || 'Médio'],
  ];

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map(([label, value]) => new TableRow({
      children: [
        new TableCell({
          width: { size: 40, type: WidthType.PERCENTAGE },
          // Negrito é propriedade do TextRun, não do Paragraph. O código antigo
          // passava `bold: true` ao Paragraph, que ignorava a opção em silêncio.
          children: [new Paragraph({ children: [new TextRun({ text: label, bold: true })] })],
        }),
        new TableCell({
          width: { size: 60, type: WidthType.PERCENTAGE },
          children: [new Paragraph({ children: [new TextRun({ text: value })] })],
        }),
      ],
    })),
  });
}

function splitLines(text) {
  return String(text || '').split('\n').map(l => l.trim()).filter(Boolean);
}

module.exports = router;
