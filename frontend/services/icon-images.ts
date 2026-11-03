// Converts a downloaded icon (PNG, JPEG or ICO) into the three formats Steam's
// icon cache uses, so the backend only has to write bytes.

export type IconImages = {
  png: string;
  jpg: string;
  ico: string;
};

// Steam's cached icons are small; this keeps the written files reasonable
// while staying sharp in Big Picture.
const MAX_ICON_SIZE = 256;
// JPEG has no transparency. Matches the dark background the PowerShell
// version used.
const JPEG_BACKGROUND = '#101010';

const mimeForBase64 = (base64: string) => {
  if (base64.startsWith('iVBORw0KGgo')) return 'image/png';
  if (base64.startsWith('/9j/')) return 'image/jpeg';
  if (base64.startsWith('AAABAA')) return 'image/x-icon';
  return 'application/octet-stream';
};

const loadImage = (base64: string) => new Promise<HTMLImageElement>((resolve, reject) => {
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error('The downloaded icon could not be decoded.'));
  image.src = `data:${mimeForBase64(base64)};base64,${base64}`;
});

const canvasBase64 = (canvas: HTMLCanvasElement, type: 'image/png' | 'image/jpeg') =>
  canvas.toDataURL(type, 0.92).split(',', 2)[1] ?? '';

const base64ToBytes = (base64: string) => Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));

const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
};

// A single-image ICO that wraps PNG data, which every current Windows and
// Chromium reader accepts.
const pngToIco = (pngBase64: string, size: number) => {
  const png = base64ToBytes(pngBase64);
  const ico = new Uint8Array(6 + 16 + png.length);
  const view = new DataView(ico.buffer);
  view.setUint16(0, 0, true);
  view.setUint16(2, 1, true);
  view.setUint16(4, 1, true);
  ico[6] = size >= 256 ? 0 : size;
  ico[7] = size >= 256 ? 0 : size;
  view.setUint16(10, 1, true);
  view.setUint16(12, 32, true);
  view.setUint32(14, png.length, true);
  view.setUint32(18, 22, true);
  ico.set(png, 22);
  return bytesToBase64(ico);
};

export async function renderIconImages(sourceBase64: string): Promise<IconImages> {
  const image = await loadImage(sourceBase64);
  const size = Math.max(1, Math.min(MAX_ICON_SIZE, Math.max(image.naturalWidth, image.naturalHeight)));

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Could not prepare the icon image.');
  }

  // Fit non-square icons inside the square without stretching them.
  const scale = size / Math.max(image.naturalWidth, image.naturalHeight);
  const width = image.naturalWidth * scale;
  const height = image.naturalHeight * scale;
  const drawIcon = () => context.drawImage(image, (size - width) / 2, (size - height) / 2, width, height);

  context.imageSmoothingQuality = 'high';
  drawIcon();
  const png = canvasBase64(canvas, 'image/png');

  context.fillStyle = JPEG_BACKGROUND;
  context.fillRect(0, 0, size, size);
  drawIcon();
  const jpg = canvasBase64(canvas, 'image/jpeg');

  if (!png || !jpg) {
    throw new Error('Could not convert the icon image.');
  }
  return { png, jpg, ico: pngToIco(png, size) };
}
