/**
 * Redimensiona a foto no navegador antes de enviar.
 *
 * Fazer isso no cliente evita adicionar `sharp` ao servidor (binário nativo,
 * pesado em cold start de serverless) e poupa a banda de quem sobe uma foto de
 * 4 MB direto da câmera do celular — o que chega no servidor tem ~80 KB.
 */

const FULL_MAX = 1024;
const THUMB_MAX = 320;
const MAX_INPUT_BYTES = 15 * 1024 * 1024;

let webpSupport = null;

function supportsWebp() {
  if (webpSupport === null) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    webpSupport = canvas.toDataURL('image/webp').startsWith('data:image/webp');
  }
  return webpSupport;
}

function drawScaled(bitmap, maxSide) {
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));

  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function toDataUrl(canvas, quality) {
  const type = supportsWebp() ? 'image/webp' : 'image/jpeg';
  return canvas.toDataURL(type, quality);
}

/**
 * Recebe o File do <input type="file"> e devolve as duas versões em data URL.
 * `imageOrientation: 'from-image'` respeita o EXIF — sem isso, fotos tiradas
 * de lado no celular chegam deitadas.
 */
export async function processImage(file) {
  if (!file.type.startsWith('image/')) {
    throw new Error('Escolha um arquivo de imagem');
  }
  if (file.size > MAX_INPUT_BYTES) {
    throw new Error('Imagem grande demais (máximo 15 MB)');
  }

  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    return {
      full: toDataUrl(drawScaled(bitmap, FULL_MAX), 0.82),
      thumb: toDataUrl(drawScaled(bitmap, THUMB_MAX), 0.75),
    };
  } finally {
    bitmap.close();
  }
}
