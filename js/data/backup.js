// Export/Import aller eigenen Daten als JSON-Datei.
// Das Format ist bewusst einfach und versioniert, damit es später auch die iOS-App lesen kann.
import * as db from './db.js';

export const BACKUP_FORMAT = 'ernaehrungsapp-backup';
export const BACKUP_VERSION = 1;

export async function createBackup() {
  const data = {};
  for (const name of Object.values(db.STORES)) data[name] = await db.getAll(name);
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    data,
  };
}

export function backupFileName(d = new Date()) {
  const z = (n) => String(n).padStart(2, '0');
  return `ernaehrung-backup-${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}.json`;
}

/** Prüft eine Backup-Datei und gibt eine kurze Zusammenfassung zurück (ohne etwas zu ändern). */
export function inspectBackup(json) {
  if (!json || json.format !== BACKUP_FORMAT) throw new Error('Das ist keine Backup-Datei dieser App.');
  if (json.version > BACKUP_VERSION) throw new Error('Die Backup-Datei stammt aus einer neueren App-Version.');
  const d = json.data || {};
  const dates = (d.entries || []).map((e) => e.date).sort();
  return {
    entries: (d.entries || []).length,
    foods: (d.foods || []).length,
    firstDate: dates[0] || null,
    lastDate: dates[dates.length - 1] || null,
    exportedAt: json.exportedAt,
  };
}

/** Ersetzt alle Daten durch die aus dem Backup. */
export async function restoreBackup(json) {
  inspectBackup(json);
  const data = {};
  for (const name of Object.values(db.STORES)) data[name] = json.data[name] || [];
  await db.replaceAll(data);
}
