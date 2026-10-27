// Barcode-Scanner über die Kamera.
// Im Browser (PWA) nutzen wir die Bibliothek zxing-wasm (liegt in /vendor, läuft offline).
// In der späteren iOS-App kann hier ein natives Scanner-Plugin eingesetzt werden,
// ohne dass sich der Rest der App ändert: Schnittstelle bleibt scanBarcode(videoEl, signal).

let readerReady = null;

function loadReader() {
  if (readerReady) return readerReady;
  readerReady = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'vendor/zxing/zxing-reader.js';
    s.onload = () => {
      const Z = window.ZXingWASM;
      Z.prepareZXingModule({
        overrides: { locateFile: (path, prefix) => (path.endsWith('.wasm') ? `vendor/zxing/${path}` : prefix + path) },
        fireImmediately: true,
      });
      resolve(Z);
    };
    s.onerror = () => reject(new Error('Scanner konnte nicht geladen werden.'));
    document.head.appendChild(s);
  });
  return readerReady;
}

export function cameraAvailable() {
  return !!navigator.mediaDevices?.getUserMedia;
}

/**
 * Startet die Kamera im übergebenen <video>-Element und liefert den ersten erkannten Barcode.
 * Abbrechen über AbortSignal.
 */
export async function scanBarcode(video, signal) {
  const Z = await loadReader();
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: false,
  });
  video.srcObject = stream;
  video.setAttribute('playsinline', '');
  video.muted = true;
  await video.play();

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const stop = () => stream.getTracks().forEach((t) => t.stop());

  try {
    while (!signal?.aborted) {
      await new Promise((r) => setTimeout(r, 150));
      if (!video.videoWidth) continue;
      // Nur den mittleren Streifen auswerten: schneller und weniger Fehltreffer
      const w = video.videoWidth;
      const h = Math.round(video.videoHeight * 0.5);
      canvas.width = w;
      canvas.height = h;
      ctx.drawImage(video, 0, (video.videoHeight - h) / 2, w, h, 0, 0, w, h);
      const results = await Z.readBarcodes(ctx.getImageData(0, 0, w, h), {
        formats: ['EAN13', 'EAN8', 'UPCA', 'UPCE'],
        tryHarder: true,
        maxNumberOfSymbols: 1,
      });
      const hit = results.find((r) => r.isValid && r.text);
      if (hit) return hit.text;
    }
    return null;
  } finally {
    stop();
    video.srcObject = null;
  }
}
