// Kleine Hilfsfunktionen für die Oberfläche (ohne Framework).

/**
 * Erzeugt ein HTML-Element.
 * h('button', { class: 'btn', onclick: fn }, 'Text')
 */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === false || v == null) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

/**
 * Öffnet ein Blatt, das von unten hereinfährt (wie bei iOS).
 * Gibt { el, body, close } zurück; onClose wird beim Schließen aufgerufen.
 */
export function openSheet({ title, onClose, full = false, actions = [] } = {}) {
  const body = h('div', { class: 'sheet-body' });
  const close = () => {
    sheet.classList.remove('open');
    backdrop.classList.remove('open');
    setTimeout(() => {
      backdrop.remove();
      sheet.remove();
    }, 220);
    document.removeEventListener('keydown', onKey);
    onClose?.();
  };
  const onKey = (e) => e.key === 'Escape' && close();
  // Mehrere Blätter übereinander: jedes neue liegt über dem vorherigen
  const z = 20 + document.querySelectorAll('.sheet').length * 2;
  const backdrop = h('div', { class: 'backdrop', onclick: close, style: { zIndex: z } });
  const sheet = h(
    'section',
    { class: `sheet${full ? ' full' : ''}`, role: 'dialog', 'aria-label': title || '', style: { zIndex: z + 1 } },
    h(
      'header',
      { class: 'sheet-head' },
      h('button', { class: 'link', onclick: close }, 'Schließen'),
      h('h2', {}, title || ''),
      h('div', { class: 'sheet-actions' }, actions)
    ),
    body
  );
  document.body.append(backdrop, sheet);
  document.addEventListener('keydown', onKey);
  requestAnimationFrame(() => {
    backdrop.classList.add('open');
    sheet.classList.add('open');
  });
  return { el: sheet, body, close };
}

let toastTimer = null;
/** Kurze Meldung unten am Bildschirm, optional mit Knopf (z. B. "Rückgängig"). */
export function toast(text, action) {
  document.querySelector('.toast')?.remove();
  clearTimeout(toastTimer);
  const el = h(
    'div',
    { class: 'toast', role: 'status' },
    h('span', {}, text),
    action &&
      h(
        'button',
        {
          class: 'link',
          onclick: () => {
            el.remove();
            action.run();
          },
        },
        action.label
      )
  );
  document.body.append(el);
  toastTimer = setTimeout(() => el.remove(), action ? 5000 : 2500);
}

/** Einfache Bestätigungsabfrage im App-Stil. */
export function confirmDialog(text, okLabel = 'OK') {
  return new Promise((resolve) => {
    const s = openSheet({ title: 'Bitte bestätigen', onClose: () => resolve(false) });
    s.body.append(
      h('p', {}, text),
      h(
        'div',
        { class: 'row-buttons' },
        h('button', { class: 'btn', onclick: () => s.close() }, 'Abbrechen'),
        h(
          'button',
          {
            class: 'btn danger',
            onclick: () => {
              resolve(true);
              s.close();
            },
          },
          okLabel
        )
      )
    );
  });
}

export function formatDateLong(iso) {
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
}

export function shiftDate(iso, days) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  const z = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}
