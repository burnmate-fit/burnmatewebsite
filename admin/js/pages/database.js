import { api, API_BASE } from '../api.js';
import { el, header, card, tabs, spinner, errorBox, pill } from '../ui.js';

let activeTab = 'exercises';

export async function renderDatabase(view) {
  view.append(header('Database', 'The exercise catalog the CM5 board and the app pull from.'));
  const bar = tabs([['exercises', 'Exercises'], ['food', 'Food recommendations']], activeTab, (k) => { activeTab = k; renderDatabase(view.replaceChildren() || view); });
  const body = el('div', {});
  view.append(bar, body);
  if (activeTab === 'exercises') await renderExercises(body);
  else renderFood(body);
}

function renderFood(body) {
  body.append(el('div', { class: 'rounded-xl border border-dashed border-line bg-surface/40 p-12 text-center' },
    el('div', { class: 'text-4xl mb-3 opacity-40' }, '🥗'),
    el('p', { class: 'text-neutral-500 text-sm' }, 'Food is generated per-plan by the AI — no stored catalog yet. This tab stays blank until we add a food/ingredient table.')));
}

async function renderExercises(body) {
  const slot = el('div', {}, spinner('Loading exercises…'));
  body.append(slot);
  let list;
  try { list = await api.exercises(); }
  catch (e) { slot.replaceChildren(errorBox(e)); return; }

  const toolbar = el('div', { class: 'flex items-center mb-4' },
    el('div', { class: 'text-sm text-neutral-500' }, `${list.length} exercises`),
    el('button', { class: 'ml-auto bg-accent text-ink font-semibold text-sm px-3 py-1.5 rounded-lg hover:bg-accentDim',
      onclick: () => openForm(body, null) }, '+ Add exercise'),
  );

  const grid = el('div', { class: 'grid sm:grid-cols-2 lg:grid-cols-3 gap-4' });
  for (const ex of list) {
    const img = ex.image_url ? (ex.image_url.startsWith('http') ? ex.image_url : API_BASE + ex.image_url) : null;
    grid.append(card(
      el('div', { class: 'flex gap-3' },
        el('div', { class: 'w-16 h-16 rounded-lg bg-ink border border-line shrink-0 overflow-hidden flex items-center justify-center text-2xl' },
          img ? el('img', { src: img, class: 'w-full h-full object-cover', onerror: function () { this.replaceWith(document.createTextNode('🏋')); } }) : '🏋'),
        el('div', { class: 'min-w-0' },
          el('div', { class: 'font-bold truncate' }, ex.display_name || ex.slug),
          el('div', { class: 'text-xs text-neutral-500' }, ex.slug),
          el('div', { class: 'flex flex-wrap gap-1 mt-1.5' },
            ex.muscle_group ? pill(ex.muscle_group, 'accent') : null,
            ex.sets ? pill(`sets ${ex.sets.join('/')}`) : null,
          ),
        ),
      ),
      el('div', { class: 'flex gap-2 mt-3 pt-3 border-t border-line' },
        el('span', { class: 'text-[11px] text-neutral-600 truncate flex-1' }, ex.trainer_config || 'no trainer cfg'),
        el('button', { class: 'text-xs text-accent hover:underline', onclick: () => openForm(body, ex) }, 'edit'),
        el('button', { class: 'text-xs text-danger hover:underline', onclick: async () => {
          if (!confirm(`Delete "${ex.slug}"?`)) return;
          await api.deleteExercise(ex.slug); renderDatabaseReset(body);
        } }, 'delete'),
      ),
    ));
  }
  slot.replaceChildren(toolbar, grid);
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
      box.textContent = `⚠ ${err.message}`;
      box.classList.remove('hidden');
    }
  });
  form.append(f);
  document.body.append(form);
}

const splitList = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);
