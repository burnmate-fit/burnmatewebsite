import { api, API_BASE } from './api.js';
import { el } from './ui.js';
import { icon } from './icons.js';
import { renderAnalysis } from './pages/analysis.js';
import { renderSchema } from './pages/schema.js';
import { renderPipeline } from './pages/pipeline.js';
import { renderDatabase } from './pages/database.js';
import { renderTrainer } from './pages/trainer.js';
import { renderNotifications } from './pages/notifications.js';

const ROUTES = [
  { id: 'analysis', label: 'Analysis', icon: 'bar-chart', render: renderAnalysis },
  { id: 'schema', label: 'Schema', icon: 'table', render: renderSchema },
  { id: 'pipeline', label: 'AI Pipeline', icon: 'cpu', render: renderPipeline },
  { id: 'database', label: 'Database', icon: 'dumbbell', render: renderDatabase },
  { id: 'trainer', label: 'Trainer Designer', icon: 'person', render: renderTrainer },
  { id: 'notifications', label: 'Notifications', icon: 'bell', render: renderNotifications },
];

const view = document.getElementById('view');
const nav = document.getElementById('nav');

function buildNav() {
  ROUTES.forEach((r) => {
    nav.append(el('a', {
      href: `#/${r.id}`,
      'data-id': r.id,
      class: 'nav-item flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium text-neutral-400 border border-transparent hover:text-neutral-200 hover:bg-white/[0.03]',
    },
      icon(r.icon, 'w-[17px] h-[17px] shrink-0'),
      el('span', {}, r.label),
      el('span', { class: 'dot ml-auto w-1.5 h-1.5 rounded-full bg-accent opacity-0' }),
    ));
  });
}

function setActive(id) {
  nav.querySelectorAll('.nav-item').forEach((n) =>
    n.classList.toggle('active', n.dataset.id === id));
}

async function route() {
  const id = (location.hash.replace('#/', '') || 'analysis');
  const r = ROUTES.find((x) => x.id === id) || ROUTES[0];
  setActive(r.id);
  view.innerHTML = '';
  try {
    await r.render(view);
  } catch (e) {
    view.append(el('div', { class: 'text-danger' }, `Failed to render: ${e.message}`));
  }
}

async function pingStatus() {
  const dot = document.getElementById('status-dot');
  document.getElementById('api-base').textContent = API_BASE.replace(/^https?:\/\//, '');
  try {
    const s = await api.status();
    dot.innerHTML = '';
    dot.append(
      el('span', { class: `w-2 h-2 rounded-full ${s.db_connected ? 'bg-accent' : 'bg-danger'}` }),
      el('span', {}, `${s.db_connected ? 'db ok' : 'db down'} · ${s.exercises} exercises`),
    );
  } catch {
    dot.innerHTML = '<span class="w-2 h-2 rounded-full bg-danger"></span><span>backend unreachable</span>';
  }
}

buildNav();
window.addEventListener('hashchange', route);
if (!location.hash) location.hash = '#/analysis';
route();
pingStatus();
