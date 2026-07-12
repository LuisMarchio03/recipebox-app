const XLSX = require('xlsx');
const path = require('path');

const headers = [
  'Título',
  'Descrição',
  'Ingredientes',
  'Modo de Preparo',
  'Tempo de Preparo (min)',
  'Tempo de Cozimento (min)',
  'Porções',
  'Categoria',
  'Dificuldade',
  'Privada',
];

const example = [
  'Bolo de Cenoura',
  'Bolo fofinho com cobertura de chocolate',
  '3 cenouras médias raladas\n4 ovos\n1 xícara de óleo\n2 xícaras de açúcar\n2 xícaras de farinha de trigo\n1 colher de sopa de fermento em pó',
  'Bata os ingredientes no liquidificador.\nAdicione a farinha e misture.\nAsse em forno preaquecido.',
  '20',
  '40',
  '12',
  'Bolos',
  'Médio',
  'Não',
];

const wb = XLSX.utils.book_new();

const wsData = [headers, example];
const ws = XLSX.utils.aoa_to_sheet(wsData);

ws['!cols'] = [
  { wch: 25 }, { wch: 35 }, { wch: 50 }, { wch: 50 },
  { wch: 18 }, { wch: 18 }, { wch: 10 }, { wch: 15 }, { wch: 12 }, { wch: 10 },
];

XLSX.utils.book_append_sheet(wb, ws, 'Modelo Importação');

const instructionsData = [
  ['INSTRUÇÕES PARA IMPORTAR RECEITAS'],
  [],
  ['1. Preencha os dados na planilha "Modelo Importação" seguindo o cabeçalho.'],
  ['2. Os campos Título, Ingredientes e Modo de Preparo são OBRIGATÓRIOS.'],
  ['3. Ingredientes e Modo de Preparo: use Alt+Enter para pular linha dentro da célula.'],
  ['4. Privada: use "Sim" para receita privada ou "Não" para pública.'],
  ['5. Categoria: use exemplos como "Bolos", "Carnes", "Sobremesas", "Massas", "Saladas", "Bebidas", etc.'],
  ['6. Dificuldade: use "Fácil", "Médio" ou "Difícil".'],
  ['7. Para pular linhas dentro de uma célula no Excel, use Alt+Enter.'],
  [],
  ['CAMPOS DA PLANILHA:'],
  ['- Título (OBRIGATÓRIO): Nome da receita'],
  ['- Descrição: Uma breve descrição'],
  ['- Ingredientes (OBRIGATÓRIO): Lista de ingredientes'],
  ['- Modo de Preparo (OBRIGATÓRIO): Passo a passo do preparo'],
  ['- Tempo de Preparo (min): Tempo de preparo em minutos'],
  ['- Tempo de Cozimento (min): Tempo de cozimento em minutos'],
  ['- Porções: Número de porções'],
  ['- Categoria: Categoria da receita'],
  ['- Privada: "Sim" ou "Não"'],
  [],
  ['Após preencher, vá no sistema e faça o upload deste arquivo.'],
];

const wsInstructions = XLSX.utils.aoa_to_sheet(instructionsData);
wsInstructions['!cols'] = [{ wch: 80 }];
XLSX.utils.book_append_sheet(wb, wsInstructions, 'Instruções');

const outputPath = path.join(__dirname, '..', 'public', 'modelo_importacao_receitas.xlsx');
XLSX.writeFile(wb, outputPath);
console.log(`Template gerado em: ${outputPath}`);
