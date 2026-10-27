// Cloudflare Worker: lädt eine Rezeptseite für die Ernährungs-App (umgeht die CORS-Sperre).
// Aufruf: https://<dein-worker>.workers.dev/?url=https://www.chefkoch.de/rezepte/...&key=<SCHLÜSSEL>
//
// Sicherheit: Wenn im Worker die Variable KEY gesetzt ist, funktioniert er nur mit diesem Schlüssel.
// Es werden nur HTML-Seiten weitergegeben (max. 3 MB).

const MAX_BYTES = 3 * 1024 * 1024;

export default {
  async fetch(request, env) {
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
    };
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (request.method !== 'GET') return new Response('Nur GET', { status: 405, headers: cors });

    const params = new URL(request.url).searchParams;
    if (env.KEY && params.get('key') !== env.KEY) return new Response('Falscher Schlüssel', { status: 403, headers: cors });

    let target;
    try {
      target = new URL(params.get('url') || '');
    } catch {
      return new Response('Parameter url fehlt', { status: 400, headers: cors });
    }
    if (!['http:', 'https:'].includes(target.protocol)) return new Response('Nur http/https', { status: 400, headers: cors });

    const res = await fetch(target.toString(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'de-DE,de;q=0.9',
      },
      redirect: 'follow',
    });
    const type = res.headers.get('content-type') || '';
    if (!type.includes('html')) return new Response('Keine HTML-Seite', { status: 415, headers: cors });
    const body = await res.arrayBuffer();
    if (body.byteLength > MAX_BYTES) return new Response('Seite zu groß', { status: 413, headers: cors });
    return new Response(body, {
      status: res.status,
      headers: { ...cors, 'Content-Type': type },
    });
  },
};
