// Dateien speichern und öffnen – plattformabhängig, daher hier gekapselt.
// iPhone (PWA): "Teilen"-Menü → "In Dateien sichern". Sonst: normaler Download.
// In der späteren iOS-App kann hier das Capacitor-Filesystem/Share-Plugin eingesetzt werden.

export async function saveFile(fileName, text, mime) {
  const file = new File([text], fileName, { type: mime });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: fileName });
      return;
    } catch (e) {
      if (e.name === 'AbortError') return;
      // sonst: auf Download ausweichen
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** Lässt eine Datei auswählen und gibt ihren Text zurück (oder null bei Abbruch). */
export function pickFile(accept) {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.display = 'none';
    input.addEventListener('change', async () => {
      const f = input.files?.[0];
      input.remove();
      if (!f) return resolve(null);
      try {
        resolve(await f.text());
      } catch (e) {
        reject(e);
      }
    });
    document.body.append(input);
    input.click();
  });
}
