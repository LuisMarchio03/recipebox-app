/**
 * Detecta durações no texto do passo e oferece um cronômetro.
 * "Leve ao forno por 40 minutos" vira um botão de 40 min.
 */

const PATTERNS = [
  { re: /(\d+)\s*(?:a|até|-|–)\s*(\d+)\s*(?:min|minutos?)\b/i, unit: 60, pick: m => Number(m[2]) },
  { re: /(\d+(?:[.,]\d+)?)\s*(?:h|horas?)\b/i, unit: 3600, pick: m => Number(m[1].replace(',', '.')) },
  { re: /(\d+)\s*(?:min|minutos?)\b/i, unit: 60, pick: m => Number(m[1]) },
  { re: /(\d+)\s*(?:seg|segundos?)\b/i, unit: 1, pick: m => Number(m[1]) },
];

/** Devolve a duração em segundos encontrada no texto, ou null. */
export function detectDuration(text) {
  for (const { re, unit, pick } of PATTERNS) {
    const match = re.exec(text);
    if (match) {
      const seconds = Math.round(pick(match) * unit);
      // Ignora extremos: "1 segundo" não merece cronômetro e "500 horas" é
      // quase certamente um número solto que casou por acidente.
      if (seconds >= 30 && seconds <= 12 * 3600) return seconds;
    }
  }
  return null;
}

export function formatDuration(seconds) {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = n => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

/**
 * Toca um alarme sintetizado via Web Audio. Um arquivo de áudio exigiria
 * afrouxar a CSP e adicionar um asset; três bipes de oscilador não exigem nada.
 */
function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    for (let i = 0; i < 3; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880;
      osc.type = 'sine';

      const start = ctx.currentTime + i * 0.45;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.3, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.35);
      osc.start(start);
      osc.stop(start + 0.4);
    }
    setTimeout(() => ctx.close(), 2000);
  } catch {
    // Sem áudio disponível: o alerta visual e a vibração dão conta.
  }
}

export function createTimer({ onTick, onFinish }) {
  let endsAt = null;
  let interval = null;
  let label = '';

  function stop() {
    clearInterval(interval);
    interval = null;
    endsAt = null;
    label = '';
  }

  function tick() {
    // Baseado no relógio, não em contagem regressiva: setInterval é
    // estrangulado em abas de segundo plano, e um contador decremental
    // atrasaria minutos enquanto o usuário olha outra coisa.
    const remaining = (endsAt - Date.now()) / 1000;

    if (remaining <= 0) {
      const finished = label;
      stop();
      beep();
      navigator.vibrate?.([300, 150, 300]);
      onFinish?.(finished);
      return;
    }
    onTick?.(remaining, label);
  }

  return {
    start(seconds, timerLabel = '') {
      stop();
      label = timerLabel;
      endsAt = Date.now() + seconds * 1000;
      onTick?.(seconds, label);
      interval = setInterval(tick, 250);
    },
    cancel: stop,
    isRunning: () => interval !== null,
  };
}
