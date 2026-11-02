/**
 * Photos are stored in Firestore (Firebase Storage needs the paid plan), and a Firestore
 * document is capped at 1 MB. So every photo is shrunk on the phone before it's saved:
 * longest side down to `maxSide`, re-encoded as JPEG until it fits `maxChars`.
 */
export async function compressImage(file, { maxSide = 1280, maxChars = 270_000 } = {}) {
  if (!file.type.startsWith('image/')) throw new Error('not-image');
  const img = await loadImage(file);
  let side = maxSide;
  for (let attempt = 0; attempt < 8; attempt++) {
    const scale = Math.min(1, side / Math.max(img.width, img.height));
    const w = Math.round(img.width * scale);
    const h = Math.round(img.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; // screenshots with transparency would turn black as JPEG
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    for (const q of [0.72, 0.6, 0.48]) {
      const url = canvas.toDataURL('image/jpeg', q);
      if (url.length <= maxChars) return url;
    }
    side = Math.round(side * 0.75);
  }
  throw new Error('too-big');
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('unreadable')); };
    img.src = url;
  });
}

export const imageError = (e) =>
  e?.message === 'not-image' ? 'That file isn’t a photo. Pick a picture or screenshot.'
    : e?.message === 'unreadable' ? 'Couldn’t open that photo. Try a screenshot of it instead.'
      : 'That photo is too big to attach. Try a screenshot instead.';

/** Local date as YYYY-MM-DD (not UTC, so late-night entries land on the right day). */
export const todayISO = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

export const prettyDate = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
};
