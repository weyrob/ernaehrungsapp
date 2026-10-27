# Ernährung – persönliches Ernährungstagebuch

Eine kleine App zum Erfassen von Essen mit Makro- und Mikronährstoffen.
Läuft als Web-App (PWA) im Browser und kann auf dem iPhone zum Home-Bildschirm hinzugefügt werden.
Kein Login, keine Cloud, keine Werbung. Alle Daten bleiben auf dem Gerät.

## Benutzen
1. Die Adresse der App in **Safari** auf dem iPhone öffnen.
2. Teilen-Knopf → **„Zum Home-Bildschirm“**.
3. Ab dann wie eine normale App starten. Funktioniert auch offline
   (nur neue Barcode-Produkte brauchen Internet).

## Aufbau (für später)
```
index.html, styles.css    Oberfläche (Grundgerüst + Aussehen)
js/app.js                 Start, Umschalten zwischen den Ansichten
js/core/                  Rechenlogik ohne Oberfläche
  nutrients.js            Liste aller Nährstoffe, Umrechnen, Summieren
  targets.js              DGE-Referenzwerte, eigene Ziele, Einordnung zu wenig/ok/zu viel
  portions.js             Portionen (1 Stück, 1 EL …) → Gramm
js/data/                  Daten
  db.js                   Speicher (IndexedDB) – einzige Stelle mit Speicherzugriff
  repo.js                 Tagebuch, Einstellungen, eigene Lebensmittel, Nutzung
  foods.js                Nährwert-Datenbank: BLS + eigene + Barcode, Suche
  openfoodfacts.js        Barcode-Abfrage bei Open Food Facts
  backup.js               Export/Import als JSON
js/platform/              Alles, was sich zwischen Browser und iOS-App unterscheidet
  scanner.js              Kamera-Barcode-Scanner
  files.js                Datei speichern/öffnen
js/ui/                    Ansichten (Tagebuch, Nährstoffe, Einstellungen, Eintragen …)
data/bls.json             Bundeslebensmittelschlüssel, umgewandelt (siehe tools/)
tools/convert_bls.py      Wandelt die offizielle BLS-Datei in data/bls.json um
vendor/zxing/             Barcode-Erkennung (zxing-wasm, MIT)
sw.js                     Offline-Speicher (Service Worker)
```

**Späterer Umstieg auf iOS (Capacitor):** Der Ordner wird unverändert als Web-Inhalt eingebunden.
Ausgetauscht werden nur Dateien in `js/platform/` (z. B. nativer Scanner) und bei Bedarf `js/data/db.js`.
Der Datenumzug läuft über Export/Import der Backup-Datei.

**Nach Änderungen an Dateien:** in `sw.js` die Versionsnummer bei `CACHE` erhöhen, damit
installierte Apps die neue Version laden (wird beim übernächsten Öffnen aktiv).

## Datenquellen & Lizenzen
- Max Rubner-Institut (2025): Bundeslebensmittelschlüssel (BLS), Version 4.0 – Deutsche Nährstoffdatenbank. Karlsruhe.
  https://doi.org/10.25826/Data20251217-134202-0 – Lizenz CC BY 4.0. Umgewandelt in das Format dieser App.
- Open Food Facts (https://world.openfoodfacts.org), Datenbank unter ODbL 1.0.
- DGE/ÖGE: Referenzwerte für die Nährstoffzufuhr, 3. Auflage 2025.
- zxing-wasm, MIT-Lizenz (vendor/zxing/LICENSE).
