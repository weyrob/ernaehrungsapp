// Einstiegspunkt: hält den App-Zustand (Datum, Einstellungen) und schaltet zwischen den Ansichten um.
import * as repo from './data/repo.js';
import { requestPersistence } from './data/db.js';
import { buildTargets } from './core/targets.js';
import { renderDiary } from './ui/diary.js';
import { renderTargets } from './ui/targets-view.js';
import { renderSettings } from './ui/settings.js';
import { renderRecipes } from './ui/recipes.js';
import { openAddFood } from './ui/add-food.js';

export const VERSION = '0.2.0';

const VIEWS = {
  diary: { title: 'Tagebuch', render: renderDiary },
  recipes: { title: 'Rezepte', render: renderRecipes },
  targets: { title: 'Nährstoffe', render: renderTargets },
  settings: { title: 'Einstellungen', render: renderSettings },
};

const app = {
  version: VERSION,
  date: repo.todayISO(),
  tab: 'diary',
  settings: null,
  targets: {},

  async reloadSettings() {
    this.settings = await repo.getSettings();
    this.targets = buildTargets(this.settings);
    await this.render();
  },

  async saveSettings(s) {
    await repo.saveSettings(s);
    await this.reloadSettings();
  },

  setDate(d) {
    this.date = d;
    this.render();
  },

  showTab(tab) {
    this.tab = tab;
    document.querySelectorAll('.tabbar button[data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    document.getElementById('title').textContent = VIEWS[tab].title;
    window.scrollTo(0, 0);
    this.render();
  },

  async render() {
    const root = document.getElementById('view');
    try {
      await VIEWS[this.tab].render(root, this);
    } catch (e) {
      console.error(e);
      root.textContent = `Fehler: ${e.message}`;
    }
  },
};

async function start() {
  document.querySelectorAll('.tabbar button[data-tab]').forEach((b) => b.addEventListener('click', () => app.showTab(b.dataset.tab)));
  document.getElementById('fab').addEventListener('click', () => openAddFood({ date: app.date, onChange: () => app.render() }));

  await app.reloadSettings();
  if (app.settings.isDefault) {
    // Erster Start: einmal zu den Einstellungen, damit Profil & Ziele passen
    app.showTab('settings');
  }

  // Beim Zurückkehren in die App nach Mitternacht auf "heute" springen
  let lastToday = repo.todayISO();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    const now = repo.todayISO();
    if (now !== lastToday) {
      if (app.date === lastToday) app.setDate(now);
      lastToday = now;
    }
  });

  requestPersistence();

  // Offline-Fähigkeit im Browser. In der iOS-App (Capacitor) liegen die Dateien ohnehin lokal.
  if ('serviceWorker' in navigator && !window.Capacitor && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('Service Worker:', e));
  }
}

start();
window.__app = app; // zum Ausprobieren in der Browser-Konsole
