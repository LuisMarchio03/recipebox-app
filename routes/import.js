const express = require('express');
const path = require('path');
const multer = require('multer');
const XLSX = require('xlsx');
const { v4: uuidv4 } = require('uuid');

const { db } = require('../db');
const config = require('../config');
const { authMiddleware } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/error');
const { badRequest } = require('../lib/http-error');
const v = require('../lib/validate');
const perm = require('../lib/permissions');

// Sem limite de tamanho, um .xlsx de 500 MB era lido inteiro para a memória do
// processo — um upload derrubava o servidor para todo mundo.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.UPLOAD_MAX_BYTES, files: 1 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext !== '.xlsx' && ext !== '.xls') {
      return cb(badRequest('Envie um arquivo .xlsx ou .xls'));
    }
    cb(null, true);
  },
});

const router = express.Router();
router.use(authMiddleware);

// Aceita cabeçalhos em português ou inglês — o modelo distribuído é em
// português, mas planilhas exportadas de outros apps costumam vir em inglês.
const COLUMNS = {
  title: ['Título', 'Titulo', 'Title'],
  description: ['Descrição', 'Descricao', 'Description'],
  ingredients: ['Ingredientes', 'Ingredients'],
  instructions: ['Modo de Preparo', 'Instruções', 'Instrucoes', 'Instructions'],
  prep_time: ['Tempo de Preparo (min)', 'Tempo de Preparo', 'Prep Time'],
  cook_time: ['Tempo de Cozimento (min)', 'Tempo de Cozimento', 'Cook Time'],
  servings: ['Porções', 'Porcoes', 'Servings'],
  category: ['Categoria', 'Category'],
  difficulty: ['Dificuldade', 'Difficulty'],
  is_private: ['Privada', 'Private'],
};

function pick(row, field) {
  for (const key of COLUMNS[field]) {
    if (row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== '') {
      return String(row[key]).trim();
    }
  }
  return '';
}

function toInt(value, fallback) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

router.post('/excel', upload.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) throw badRequest('Arquivo Excel é obrigatório');

  const groupId = await perm.assertCanPostToGroup(req.body?.group_id || null, req.user.id);

  const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) throw badRequest('A planilha está vazia');

  const rows = XLSX.utils.sheet_to_json(sheet);
  const errors = [];
  let imported = 0;

  for (let i = 0; i < rows.length; i++) {
    const line = i + 2; // +1 pelo cabeçalho, +1 porque o Excel conta a partir de 1
    const row = rows[i];

    const title = pick(row, 'title');
    const ingredients = pick(row, 'ingredients');
    const instructions = pick(row, 'instructions');

    // O código antigo só exigia título e ingredientes, então importava receitas
    // sem nenhum modo de preparo — inúteis e impossíveis de detectar depois.
    if (!title || !ingredients || !instructions) {
      const faltando = [
        !title && 'Título',
        !ingredients && 'Ingredientes',
        !instructions && 'Modo de Preparo',
      ].filter(Boolean).join(', ');
      errors.push(`Linha ${line}: faltando ${faltando}`);
      continue;
    }

    const difficulty = pick(row, 'difficulty');
    try {
      await db.execute({
        sql: `INSERT INTO recipes
                (id, title, description, ingredients, instructions, prep_time, cook_time,
                 servings, category, user_id, group_id, is_private, difficulty)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          uuidv4(),
          title.slice(0, 150),
          pick(row, 'description').slice(0, 500),
          ingredients,
          instructions,
          toInt(pick(row, 'prep_time'), 0),
          toInt(pick(row, 'cook_time'), 0),
          toInt(pick(row, 'servings'), 1) || 1,
          pick(row, 'category').slice(0, 60),
          req.user.id,
          groupId,
          /^(sim|s|yes|y|true|1)$/i.test(pick(row, 'is_private')) ? 1 : 0,
          v.DIFFICULTIES.includes(difficulty) ? difficulty : 'Médio',
        ],
      });
      imported++;
    } catch (err) {
      errors.push(`Linha ${line}: ${err.message}`);
    }
  }

  res.json({
    imported,
    skipped: errors.length,
    errors: errors.length ? errors.slice(0, 50) : undefined,
    message: imported
      ? `${imported} receita(s) importada(s)` + (errors.length ? `, ${errors.length} ignorada(s)` : '')
      : 'Nenhuma receita pôde ser importada',
  });
}));

module.exports = router;
