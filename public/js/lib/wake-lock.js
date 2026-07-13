/**
 * Mantém a tela acesa durante o modo cozinha.
 *
 * O navegador libera o wake lock sozinho quando a aba perde a visibilidade
 * (o usuário atende uma ligação, troca de app). Sem reconquistar no
 * `visibilitychange`, a tela volta a apagar assim que ele retorna — que é
 * justamente quando ele está de mãos sujas no meio da receita.
 */

let sentinel = null;
let active = false;

async function acquire() {
  if (!('wakeLock' in navigator)) return false;
  try {
    sentinel = await navigator.wakeLock.request('screen');
    sentinel.addEventListener('release', () => { sentinel = null; });
    return true;
  } catch {
    // Navegador pode recusar (bateria fraca, aba em segundo plano). Não é erro
    // fatal: a receita continua legível, a tela é que vai apagar.
    return false;
  }
}

function onVisibilityChange() {
  if (active && sentinel === null && document.visibilityState === 'visible') {
    acquire();
  }
}

export const wakeLock = {
  supported: () => 'wakeLock' in navigator,

  async enable() {
    active = true;
    document.addEventListener('visibilitychange', onVisibilityChange);
    return acquire();
  },

  async disable() {
    active = false;
    document.removeEventListener('visibilitychange', onVisibilityChange);
    try {
      await sentinel?.release();
    } catch {
      // Já liberado pelo navegador; nada a fazer.
    }
    sentinel = null;
  },
};
