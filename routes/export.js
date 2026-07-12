const express = require('express');
const XLSX = require('xlsx');
const { Document, Packer, Paragraph, Table, TableRow, TableCell, TextRun, HeadingLevel, WidthType, AlignmentType } = require('docx');
const { db } = require('../db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

router.get('/excel', async (req, res) => {
  try {
    const { group_id } = req.query;

    if (group_id) {
      const isMember = await db.execute({
        sql: 'SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?',
        args: [group_id, req.user.id],
      });
      if (isMember.rows.length === 0) {
        return res.status(403).json({ error: 'Acesso negado' });
      }
    }

    let sql, args;
    if (group_id) {
      sql = 'SELECT * FROM recipes WHERE group_id = ? ORDER BY title';
      args = [group_id];
    } else {
      sql = `SELECT * FROM recipes WHERE user_id = ?
             UNION
             SELECT DISTINCT r.* FROM recipes r
             JOIN group_members gm ON r.group_id = gm.group_id
             WHERE gm.user_id = ? AND r.is_private = 0
             ORDER BY title`;
      args = [req.user.id, req.user.id];
    }

    const result = await db.execute({ sql, args });

    const data = result.rows.map(r => ({
      Título: r.title,
      Descrição: r.description,
      Ingredientes: r.ingredients,
      'Modo de Preparo': r.instructions,
      'Tempo de Preparo (min)': r.prep_time,
      'Tempo de Cozimento (min)': r.cook_time,
      Porções: r.servings,
      Categoria: r.category,
      Dificuldade: r.difficulty || 'Médio',
      Privada: r.is_private ? 'Sim' : 'Não',
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);

    const colWidths = [
      { wch: 30 }, { wch: 40 }, { wch: 50 }, { wch: 50 },
      { wch: 15 }, { wch: 15 }, { wch: 10 }, { wch: 15 }, { wch: 12 }, { wch: 8 },
    ];
    ws['!cols'] = colWidths;

    XLSX.utils.book_append_sheet(wb, ws, 'Receitas');

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=receitas_${Date.now()}.xlsx`);
    res.send(buf);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao exportar Excel' });
  }
});

router.get('/word/:id', async (req, res) => {
  try {
    const result = await db.execute({
      sql: 'SELECT * FROM recipes WHERE id = ?',
      args: [req.params.id],
    });
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Receita não encontrada' });
    }

    const recipe = result.rows[0];
    if (recipe.is_private && recipe.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const doc = buildRecipeDoc(recipe);
    const buf = await Packer.toBuffer(doc);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename=${recipe.title.replace(/[^a-zA-Z0-9]/g, '_')}.docx`);
    res.send(buf);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao exportar Word' });
  }
});

router.get('/word/group/:groupId', async (req, res) => {
  try {
    const isMember = await db.execute({
      sql: 'SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?',
      args: [req.params.groupId, req.user.id],
    });
    if (isMember.rows.length === 0) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const recipes = await db.execute({
      sql: 'SELECT * FROM recipes WHERE group_id = ? ORDER BY title',
      args: [req.params.groupId],
    });

    const children = [];
    for (const recipe of recipes.rows) {
      children.push(buildRecipeSections(recipe));
    }

    const doc = new Document({
      title: 'Receitas do Grupo',
      sections: [{
        properties: {},
        children: [
          new Paragraph({
            text: 'Livro de Receitas',
            heading: HeadingLevel.TITLE,
            alignment: AlignmentType.CENTER,
          }),
          new Paragraph({
            text: `Total de receitas: ${recipes.rows.length}`,
            alignment: AlignmentType.CENTER,
            spacing: { after: 400 },
          }),
          ...children,
        ],
      }],
    });

    const buf = await Packer.toBuffer(doc);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename=receitas_grupo_${req.params.groupId}.docx`);
    res.send(buf);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao exportar Word' });
  }
});

function buildRecipeDoc(recipe) {
  return new Document({
    title: recipe.title,
    sections: [{
      properties: {},
      children: buildRecipeSections(recipe),
    }],
  });
}

function buildRecipeSections(recipe) {
  const items = [];

  items.push(
    new Paragraph({
      text: recipe.title,
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 400, after: 200 },
    })
  );

  if (recipe.description) {
    items.push(
      new Paragraph({
        text: recipe.description,
        spacing: { after: 200 },
        italics: true,
      })
    );
  }

  const infoData = [
    ['Tempo de Preparo', recipe.prep_time + ' min'],
    ['Tempo de Cozimento', recipe.cook_time + ' min'],
    ['Porções', String(recipe.servings)],
    ['Categoria', recipe.category || 'Geral'],
    ['Dificuldade', recipe.difficulty || 'Médio'],
  ];

  const infoRows = infoData.map(([label, value]) =>
    new TableRow({
      children: [
        new TableCell({
          children: [new Paragraph({ text: label, bold: true })],
          width: { size: 4000, type: WidthType.DXA },
        }),
        new TableCell({
          children: [new Paragraph({ text: value })],
          width: { size: 4000, type: WidthType.DXA },
        }),
      ],
    })
  );

  items.push(
    new Table({
      rows: infoRows,
      width: { size: 8000, type: WidthType.DXA },
    }),
    new Paragraph({ spacing: { before: 300 }, text: 'Ingredientes', heading: HeadingLevel.HEADING_2 }),
    new Paragraph({ text: recipe.ingredients, spacing: { after: 200 } }),
    new Paragraph({ text: 'Modo de Preparo', heading: HeadingLevel.HEADING_2 }),
    new Paragraph({ text: recipe.instructions, spacing: { after: 400 } }),
    new Paragraph({
      children: [
        new TextRun({ text: '—'.repeat(40), color: '999999' }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
    })
  );

  return items;
}

module.exports = router;
