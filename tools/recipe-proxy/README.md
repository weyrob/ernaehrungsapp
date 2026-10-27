# Eigener Vermittlungsdienst für den Rezept-Import (optional)

Die App kann fremde Websites nicht direkt laden (Browser-Sicherheitsregel „CORS“).
Ohne eigenen Dienst nutzt sie den öffentlichen Dienst allorigins.win. Ein eigener,
kostenloser Cloudflare Worker ist zuverlässiger und nur für dich.

## Einrichten (ca. 10 Minuten, kostenlos)
1. Auf https://dash.cloudflare.com ein kostenloses Konto anlegen.
2. Links **Compute (Workers)** → **Workers & Pages** → **Create** → **Create Worker**
   (Vorlage „Hello World“). Einen Namen vergeben, z. B. `rezept-proxy`, dann **Deploy**.
3. **Edit code** öffnen, den gesamten Inhalt durch den Inhalt von `worker.js` ersetzen, **Deploy**.
4. Beim Worker unter **Settings → Variables and Secrets** eine Variable `KEY` anlegen
   (Typ „Secret“) mit einem selbst ausgedachten Passwort, z. B. `apfel-kuchen-2026`.
5. Die Adresse des Workers kopieren (z. B. `https://rezept-proxy.deinname.workers.dev`).
6. In der App unter **Einstellungen → Rezept-Import** Adresse und Schlüssel eintragen, speichern.

Das kostenlose Kontingent (100.000 Aufrufe pro Tag) reicht für private Nutzung weit aus.
