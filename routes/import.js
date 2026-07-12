const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../db');
const { authMiddleware } = require('../middleware/auth');

const upload = multer({ storage: multer.memoryStorage() });
const router = express.Router();
router.use(authMiddleware);

router.post('/excel', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Arquivo Excel é obrigatório' });
    }

    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(ws);

    let imported = 0;
    const errors = [];

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      if (!row['Título'] || (!row['Ingredientes'] && !row['Ingredients'])) {
        errors.push(`Linha ${i + 2}: Título ou Ingredientes ausentes`);
        continue;
      }

      try {
        const validDiffs = ['Fácil', 'Médio', 'Difícil'];
        const diff = row['Dificuldade'] || row['Difficulty'] || 'Médio';
        await db.execute({
          sql: `INSERT INTO recipes (id, title, description, ingredients, instructions, prep_time, cook_time, servings, category, user_id, is_private, difficulty)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            uuidv4(),
            row['Título'] || row['Title'] || '',
            row['Descrição'] || row['Description'] || '',
            row['Ingredientes'] || row['Ingredients'] || '',
            row['Modo de Preparo'] || row['Instructions'] || row['Instruções'] || '',
            parseInt(row['Tempo de Preparo (min)'] || row['Prep Time'] || 0),
            parseInt(row['Tempo de Cozimento (min)'] || row['Cook Time'] || 0),
            parseInt(row['Porções'] || row['Servings'] || 1),
            row['Categoria'] || row['Category'] || '',
            req.user.id,
            (row['Privada'] || '').toLowerCase() === 'sim' ? 1 : 0,
            validDiffs.includes(diff) ? diff : 'Médio',
          ],
        });
        imported++;
      } catch (err) {
        errors.push(`Linha ${i + 2}: ${err.message}`);
      }
    }

    res.json({
      imported,
      errors: errors.length > 0 ? errors : undefined,
      message: `${imported} receita(s) importada(s) com sucesso`,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao importar Excel' });
  }
});

module.exports = router;
