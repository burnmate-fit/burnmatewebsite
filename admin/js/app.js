import { api, API_BASE } from './api.js';
import { el } from './ui.js';
import { icon } from './icons.js';
import { renderAnalysis } from './pages/analysis.js';
import { renderSchema } from './pages/schema.js';
import { renderPipeline } from './pages/pipeline.js';
import { renderDatabase } from './pages/database.js';
import { renderTrainer } from './pages/trainer.js';
import { renderNotifications } from './pages/notifications.js';
import { renderCatalog } from './pages/catalog.js';
import { renderUsers } from './pages/users.js';
import { renderExerciseEditor } from './pages/exercise_editor.js';

const ROUTES = [
  { id: 'analysis', label: 'Analysis', icon: 'bar-chart', render: renderAnalysis },
  { id: 'schema', label: 'Schema', icon: 'table', render: renderSchema },
  { id: 'pipeline', label: 'AI Pipeline', icon: 'cpu', render: renderPipeline },
  { id: 'database', label: 'Database', icon: 'dumbbell', render: renderDatabase },
  { id: 'catalog', label: 'Catalog', icon: 'table', render: renderCatalog },
  { id: 'exercise', label: 'Exercise Editor', icon: 'edit', render: renderExerciseEditor },
  { id: 'trainer', label: 'Trainer Designer', icon: 'person', render: renderTrainer },
  { id: 'notifications', label: 'Notifications', icon: 'bell', render: renderNotifications },
  { id: 'users', label: 'Users', icon: 'person', render: renderUsers },
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

// ── Simple entry gate ────────────────────────────────────────────────────
// Hardcoded password to open the admin UI. This gates the UI only (the
// backend API is separate); kept intentionally simple per request.
const ADMIN_PASSWORD = '2026';

function bootstrap() {
  buildNav();
  window.addEventListener('hashchange', route);
  if (!location.hash) location.hash = '#/analysis';
  route();
  pingStatus();
}

function showGate() {
  const overlay = el('div', {
    class: 'fixed inset-0 z-[9999] flex items-center justify-center',
    style: 'background:#0d0f0c;',
  });
  const input = el('input', {
    type: 'password', placeholder: 'Password', autofocus: 'true',
    class: 'w-full bg-ink border border-line rounded-lg px-3 py-2 text-sm mb-3 focus:border-accent outline-none',
  });
  const err = el('div', { class: 'text-danger text-xs mb-3 hidden' }, 'Wrong password');
  const btn = el('button', { class: 'w-full bg-accent text-ink font-semibold text-sm px-4 py-2 rounded-lg' }, 'Enter');
  const submit = () => {
    if (input.value === ADMIN_PASSWORD) {
      sessionStorage.setItem('bm_admin_auth', '1');
      overlay.remove();
      bootstrap();
    } else {
      err.classList.remove('hidden');
      input.value = '';
      input.focus();
    }
  };
  btn.onclick = submit;
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
  overlay.append(el('div', { class: 'bg-surface border border-line rounded-xl p-8 w-80' },
    el('div', { class: 'w-10 h-10 rounded-lg bg-accent flex items-center justify-center text-ink font-extrabold mb-4' }, 'B'),
    el('div', { class: 'font-bold text-lg mb-1' }, 'BurnMate Admin'),
    el('div', { class: 'text-xs text-neutral-500 mb-4' }, 'Enter password to continue'),
    input, err, btn,
  ));
  document.body.append(overlay);
  input.focus();
}

if (sessionStorage.getItem('bm_admin_auth') === '1') bootstrap();
else showGate();
