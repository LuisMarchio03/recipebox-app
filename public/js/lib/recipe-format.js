/**
 * Formato interno de armazenamento das receitas:
 *   - ingrediente: "2 xícaras | farinha de trigo"  (quantidade | nome)
 *   - passo de seção: "# Creme Branco"
 *   - passo normal: texto livre
 *
 * A tela de detalhe e o modo cozinha precisavam da mesma leitura desse formato.
 * Estava duplicado; agora mora aqui.
 */

export function parseIngredients(text) {
  return String(text || '')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const sep = line.indexOf(' | ');
      return sep > 0
        ? { quantity: line.slice(0, sep).trim(), name: line.slice(sep + 3).trim() }
        : { quantity: '', name: line };
    });
}

/**
 * Devolve as seções do preparo. Os passos recebem um índice global contínuo,
 * porque é ele que indexa o progresso salvo no localStorage — numerar por
 * seção faria o progresso pular de lugar ao adicionar uma seção nova.
 */
export function parseInstructions(text) {
  const lines = String(text || '')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);

  const sections = [];
  let current = { title: null, steps: [] };
  let globalIndex = 0;

  for (const line of lines) {
    if (line.startsWith('# ')) {
      if (current.title || current.steps.length) sections.push(current);
      current = { title: line.slice(2).trim(), steps: [] };
    } else {
      current.steps.push({ text: line, index: globalIndex++ });
    }
  }
  if (current.title || current.steps.length) sections.push(current);

  return { sections, totalSteps: globalIndex };
}

export function countCheckedSteps(progress, totalSteps) {
  let done = 0;
  for (let i = 0; i < totalSteps; i++) {
    if (progress[`inst-${i}`]) done++;
  }
  return done;
}
