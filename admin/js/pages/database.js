import { api, API_BASE } from '../api.js';
import { el, header, card, tabs, spinner, errorBox, pill } from '../ui.js';
import { icon } from '../icons.js';

let activeTab = 'exercises';

export async function renderDatabase(view) {
  view.append(header('Database', 'The exercise catalog the CM5 board and the app pull from.'));
  const bar = tabs([['exercises', 'Exercises'], ['food', 'Food recommendations']], activeTab, (k) => { activeTab = k; renderDatabase(view.replaceChildren() || view); });
  const body = el('div', {});
  view.append(bar, body);
  if (activeTab === 'exercises') await renderExercises(body);
  else renderFood(body);
}

const HCELL = 'px-2.5 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-neutral-500 border-b-2 border-line sticky top-0 bg-surface';
const CELL = 'px-2.5 py-1.5 whitespace-nowrap text-[12px] border-b border-line/60';

function fmtVal(v) {
  if (v === null || v === undefined || v === '') return '—';
  if (Array.isArray(v)) return v.length ? v.join(', ') : '—';
  if (typeof v === 'boolean') return v ? '✓' : '✗';
  if (typeof v === 'number') return Number.isInteger(v) ? v : v.toFixed(1);
  return String(v);
}

function dataTable(rows, cols, cellFor) {
  const head = el('tr', {}, ...cols.map((c) => el('th', { class: HCELL }, c)));
  const trs = rows.map((r) => el('tr', { class: 'hover:bg-ink/40' },
    ...cols.map((c) => cellFor ? cellFor(r, c) : el('td', { class: CELL }, fmtVal(r[c])))));
  return el('div', { class: 'overflow-auto max-h-[68vh] rounded-lg border border-line' },
    el('table', { class: 'min-w-full border-collapse' },
      el('thead', {}, head), el('tbody', {}, ...trs)));
}

async function renderFood(body) {
  const slot = el('div', {}, spinner('Loading foods…'));
  body.append(slot);
  try {
    const d = await api.catalogFoods('');
    const all = d.foods || [];
    const rows = all.slice(0, 250);
    const cols = all.length ? Object.keys(all[0]).filter((c) => c !== 'id') : [];
    slot.replaceChildren(
      el('div', { class: 'text-sm text-neutral-500 mb-3' },
        `${d.total} foods in rag_foods` + (all.length > 250 ? ' · showing first 250 — use the Catalog tab to search' : '')),
      dataTable(rows, cols, (r, c) => {
        if (c === 'diet_type') return el('td', { class: CELL }, pill(fmtVal(r[c]), r[c] === 'non-veg' ? 'danger' : r[c] === 'vegan' ? 'accent' : 'neutral'));
        return el('td', { class: CELL }, fmtVal(r[c]));
      }),
    );
  } catch (e) { slot.replaceChildren(errorBox(e)); }
}

async function renderExercises(body) {
  const slot = el('div', {}, spinner('Loading exercises…'));
  body.append(slot);
  let list;
  try { list = await api.exercises(); }
  catch (e) { slot.replaceChildren(errorBox(e)); return; }

  const toolbar = el('div', { class: 'flex items-center mb-4' },
    el('div', { class: 'text-sm text-neutral-500' }, `${list.length} device exercises (CM5 tracker/trainer configs)`),
    el('button', { class: 'ml-auto inline-flex items-center gap-1.5 bg-accent text-ink font-semibold text-sm px-3 py-1.5 rounded-lg hover:bg-accentDim',
      onclick: () => openForm(body, null) }, icon('plus', 'w-4 h-4'), 'Add exercise'),
  );

  const cols = ['display_name', 'slug', 'muscle_group', 'sets', 'rest_seconds', 'tracker_config', 'trainer_config'];
  const table = dataTable(list, [...cols, 'actions'], (ex, c) => {
    if (c === 'actions') {
      return el('td', { class: CELL },
        el('div', { class: 'flex gap-3' },
          el('button', { class: 'inline-flex items-center gap-1 text-neutral-400 hover:text-accent', onclick: () => openForm(body, ex) }, icon('edit', 'w-3.5 h-3.5'), 'Edit'),
          el('button', { class: 'inline-flex items-center gap-1 text-neutral-400 hover:text-danger', onclick: async () => {
            if (!confirm(`Delete "${ex.slug}"?`)) return;
            await api.deleteExercise(ex.slug); renderDatabaseReset(body);
          } }, icon('trash', 'w-3.5 h-3.5'), 'Delete')));
    }
    if (c === 'muscle_group' && ex.muscle_group) return el('td', { class: CELL }, pill(ex.muscle_group, 'accent'));
    return el('td', { class: CELL }, fmtVal(ex[c]));
  });
  slot.replaceChildren(toolbar, table);
}

function renderDatabaseReset(body) {
  body.replaceChildren();
  renderExercises(body);
}

function field(label, name, value, ph = '') {
  return el('label', { class: 'block' },
    el('div', { class: 'text-xs text-neutral-500 mb-1' }, label),
    el('input', { name, value: value ?? '', placeholder: ph,
      class: 'w-full bg-ink border border-line rounded-lg px-3 py-2 text-sm focus:border-accent outline-none' }));
}

function openForm(body, ex) {
  const editing = !!ex;
  const form = el('div', { class: 'fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4' });
  const f = el('form', { class: 'bg-surface border border-line rounded-xl p-6 w-full max-w-lg max-h-[90vh] overflow-auto' },
    el('h3', { class: 'font-bold text-lg mb-4' }, editing ? `Edit ${ex.slug}` : 'New exercise'),
    el('div', { class: 'grid grid-cols-2 gap-3' },
      field('Slug (id)', 'slug', ex?.slug, 'jumping_jack'),
      field('Display name', 'display_name', ex?.display_name, 'Jumping Jack'),
      field('Muscle group', 'muscle_group', ex?.muscle_group, 'Full Body'),
      field('Aliases (comma)', 'aliases', (ex?.aliases || []).join(', '), 'jumping jacks'),
      field('Sets (comma)', 'sets', (ex?.sets || []).join(', '), '12, 10, 8'),
      field('Rest seconds', 'rest_seconds', ex?.rest_seconds, '45'),
      field('Tracker config', 'tracker_config', ex?.tracker_config, 'squat.json'),
      field('Trainer config', 'trainer_config', ex?.trainer_config, 'squat_ik.json'),
      field('Image URL', 'image_url', ex?.image_url, '/media/exercises/...'),
      field('Video URL', 'video_url', ex?.video_url, '/media/exercises/...'),
    ),
    el('div', { class: 'text-danger text-xs mt-3 hidden', id: 'form-err' }),
    el('div', { class: 'flex gap-2 mt-5' },
      el('button', { type: 'button', class: 'text-sm text-neutral-400 px-3 py-2', onclick: () => form.remove() }, 'Cancel'),
      el('button', { type: 'submit', class: 'ml-auto bg-accent text-ink font-semibold text-sm px-4 py-2 rounded-lg' }, editing ? 'Save' : 'Create'),
    ),
  );
  if (editing) f.querySelector('[name=slug]').setAttribute('readonly', 'true');
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(f);
    const body_ = {
      slug: fd.get('slug').trim(),
      display_name: fd.get('display_name').trim() || null,
      muscle_group: fd.get('muscle_group').trim() || null,
      aliases: splitList(fd.get('aliases')),
      sets: splitList(fd.get('sets')).map(Number).filter((n) => !isNaN(n)),
      rest_seconds: fd.get('rest_seconds') ? Number(fd.get('rest_seconds')) : null,
      tracker_config: fd.get('tracker_config').trim() || null,
      trainer_config: fd.get('trainer_config').trim() || null,
      image_url: fd.get('image_url').trim() || null,
      video_url: fd.get('video_url').trim() || null,
    };
    try {
      if (editing) await api.updateExercise(ex.slug, body_);
      else await api.createExercise(body_);
      form.remove();
      renderDatabaseReset(body);
    } catch (err) {
      const box = f.querySelector('#form-err');
      box.textContent = err.message;
      box.classList.remove('hidden');
    }
  });
  form.append(f);
  document.body.append(form);
}

const splitList = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);
