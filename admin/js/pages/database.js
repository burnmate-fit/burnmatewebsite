import { api, API_BASE } from '../api.js';
import { el, header, card, tabs, spinner, errorBox, pill } from '../ui.js';
import { icon } from '../icons.js';

let activeTab = 'exercises';

export async function renderDatabase(view) {
  view.append(header('Database', 'The catalogs the CM5 board, the app, and the AI pull from.'));
  const bar = tabs([['exercises', 'Exercises'], ['food', 'Food (RAG)'], ['vectordb', 'Vector DB (raw)']], activeTab, (k) => { activeTab = k; renderDatabase(view.replaceChildren() || view); });
  const body = el('div', {});
  view.append(bar, body);
  if (activeTab === 'exercises') await renderExercises(body);
  else if (activeTab === 'food') await renderFood(body);
  else await renderVectorDB(body);
}

// ── Vector DB (raw, read-only) — schema + raw stored rows incl. embeddings ───
async function renderVectorDB(body) {
  const slot = el('div', {}, spinner('Loading vector DB…'));
  body.append(slot);
  let d;
  try { d = await api.vectorDb(); }
  catch (e) { slot.replaceChildren(errorBox(e)); return; }

  const isHard = (desc) => /HARD/.test(desc);
  // schema card — how each parameter is stored
  const schemaCard = card(
    el('div', { class: 'flex items-center gap-2 mb-3' },
      el('h3', { class: 'font-bold' }, 'Storage schema'),
      pill(d.table, 'accent'), pill(`${d.total} rows`)),
    el('div', { class: 'grid md:grid-cols-2 gap-x-6 gap-y-1' },
      ...d.schema.map((c) => el('div', { class: 'flex items-baseline gap-2 text-sm py-1 border-b border-line/40' },
        el('code', { class: 'text-accent' }, c.column),
        el('span', { class: 'text-[11px] text-neutral-600' }, c.type.toLowerCase()),
        isHard(c.desc) ? pill('HARD filter', 'danger') : null,
        el('span', { class: 'text-xs text-neutral-500 ml-auto text-right' }, c.desc),
      ))),
  );

  // raw rows — read-only, shows embed_text + the actual vector preview
  const rowsCard = card(
    el('div', { class: 'flex items-center gap-2 mb-3' },
      el('h3', { class: 'font-bold' }, 'Raw rows'),
      el('span', { class: 'text-xs text-neutral-600' }, 'read-only · embedding shown as first 8 of 384 dims')),
    el('div', { class: 'overflow-auto rounded-lg border border-line', style: 'max-height:520px' },
      el('table', { class: 'w-full text-sm border-collapse' },
        el('thead', { class: 'sticky top-0 bg-ink' },
          el('tr', { class: 'text-[11px] uppercase tracking-wide text-neutral-500' },
            ...['id', 'name', 'diet', 'cuisine', 'kcal', 'embed_text (embedded)', 'embedding (384-dim)']
              .map((h) => el('th', { class: 'text-left font-medium px-3 py-2 border-b border-line' }, h)))),
        el('tbody', {},
          ...d.rows.map((r) => el('tr', { class: 'border-b border-line/40 hover:bg-white/[0.02] align-top' },
            el('td', { class: 'px-3 py-2 text-neutral-600' }, r.id),
            el('td', { class: 'px-3 py-2 font-medium whitespace-nowrap' }, r.name),
            el('td', { class: 'px-3 py-2' }, r.diet_type ? pill(r.diet_type) : '—'),
            el('td', { class: 'px-3 py-2 text-neutral-400 text-xs' }, r.cuisine || '—'),
            el('td', { class: 'px-3 py-2 text-neutral-400' }, Math.round(r.calories ?? 0)),
            el('td', { class: 'px-3 py-2 text-neutral-400 text-xs max-w-[280px]' }, r.embed_text || '—'),
            el('td', { class: 'px-3 py-2' },
              el('code', { class: 'text-[11px] text-accent/80 whitespace-nowrap' },
                '[' + (r.embedding_preview || []).join(', ') + ', …]')),
          )))),
    ),
  );

  slot.replaceChildren(el('div', { class: 'space-y-6' }, schemaCard, rowsCard));
}

// ── Food (RAG) — browse the nutrition vector DB; add food auto-embeds it ─────
async function renderFood(body) {
  const slot = el('div', {}, spinner('Loading foods…'));
  body.append(slot);
  let data;
  try { data = await api.foods(); }
  catch (e) { slot.replaceChildren(errorBox(e)); return; }

  const search = el('input', { placeholder: 'search foods…',
    class: 'bg-ink border border-line rounded-lg px-3 py-1.5 text-sm focus:border-accent outline-none w-56' });
  let timer;
  search.oninput = () => { clearTimeout(timer); timer = setTimeout(async () => {
    try { const d = await api.foods(search.value); paint(d.foods); } catch {} }, 250); };

  const toolbar = el('div', { class: 'flex items-center gap-3 mb-4' },
    el('div', { class: 'text-sm text-neutral-400' }, pill(`${data.total} foods in vector DB`, 'accent')),
    el('span', { class: 'text-xs text-neutral-600' }, 'add a food → it auto-embeds (384-dim) into RAG'),
    search,
    el('button', { class: 'ml-auto inline-flex items-center gap-1.5 bg-accent text-ink font-semibold text-sm px-3 py-1.5 rounded-lg hover:bg-accentDim',
      onclick: () => openFoodForm(body) }, icon('plus', 'w-4 h-4'), 'Add food'));

  const listWrap = el('div', { class: 'rounded-xl border border-line overflow-hidden' });
  function paint(foods) {
    listWrap.replaceChildren(
      el('div', { class: 'grid grid-cols-[2fr_1fr_repeat(3,0.6fr)_1fr_auto] gap-2 px-4 py-2 text-[11px] uppercase tracking-wide text-neutral-500 bg-ink border-b border-line' },
        el('span', {}, 'Food'), el('span', {}, 'Serving'), el('span', {}, 'Cal'),
        el('span', {}, 'P'), el('span', {}, 'C/F'), el('span', {}, 'Diet · Cuisine'), el('span', {}, '')),
      ...foods.map((f) => el('div', { class: 'grid grid-cols-[2fr_1fr_repeat(3,0.6fr)_1fr_auto] gap-2 px-4 py-2 text-sm items-center border-b border-line/50 hover:bg-white/[0.02]' },
        el('span', { class: 'font-medium truncate' }, f.name,
          (f.allergens && f.allergens.length) ? el('span', { class: 'ml-1.5 text-[10px] text-danger' }, f.allergens.join(',')) : null),
        el('span', { class: 'text-neutral-500 text-xs truncate' }, f.serving_size || '—'),
        el('span', { class: 'text-neutral-300' }, Math.round(f.calories ?? 0)),
        el('span', { class: 'text-neutral-400' }, `${f.protein_g ?? 0}g`),
        el('span', { class: 'text-neutral-500 text-xs' }, `${f.carbs_g ?? 0}/${f.fat_g ?? 0}`),
        el('div', { class: 'flex gap-1 flex-wrap' }, f.diet_type ? pill(f.diet_type) : null, f.cuisine ? pill(f.cuisine, 'accent') : null),
        el('button', { class: 'text-neutral-500 hover:text-danger', title: 'delete',
          onclick: async () => { if (!confirm(`Delete "${f.name}"?`)) return; await api.deleteFood(f.id); renderFoodReset(body); } }, icon('trash', 'w-4 h-4')),
      )),
    );
  }
  paint(data.foods);
  slot.replaceChildren(toolbar, listWrap);
}

function renderFoodReset(body) { body.replaceChildren(); renderFood(body); }

function foodField(label, name, ph = '', type = 'text') {
  return el('label', { class: 'block' },
    el('div', { class: 'text-xs text-neutral-500 mb-1' }, label),
    el('input', { name, type, placeholder: ph,
      class: 'w-full bg-ink border border-line rounded-lg px-3 py-2 text-sm focus:border-accent outline-none' }));
}

function openFoodForm(body) {
  const overlay = el('div', { class: 'fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4' });
  const f = el('form', { class: 'bg-surface border border-line rounded-xl p-6 w-full max-w-lg max-h-[90vh] overflow-auto' },
    el('h3', { class: 'font-bold text-lg mb-1' }, 'Add food'),
    el('p', { class: 'text-xs text-neutral-500 mb-4' }, 'Saved → embedded into the vector DB → instantly used by RAG. Use REAL macros.'),
    el('div', { class: 'grid grid-cols-2 gap-3' },
      foodField('Name', 'name', 'Sprouted moong salad'),
      foodField('Serving size', 'serving_size', '1 bowl (100g)'),
      foodField('Calories', 'calories', '105', 'number'),
      foodField('Protein (g)', 'protein_g', '7', 'number'),
      foodField('Carbs (g)', 'carbs_g', '15', 'number'),
      foodField('Fat (g)', 'fat_g', '1', 'number'),
      foodField('Cuisine', 'cuisine', 'North Indian'),
      _foodSelect('Diet type', 'diet_type', ['', 'vegan', 'vegetarian', 'eggatarian', 'pescatarian', 'no restriction']),
      foodField('Allergens (comma)', 'allergens', 'dairy, gluten'),
      foodField('Tags (comma)', 'tags', 'high-protein, snack'),
    ),
    el('div', { class: 'text-danger text-xs mt-3 hidden', id: 'food-err' }),
    el('div', { class: 'flex gap-2 mt-5' },
      el('button', { type: 'button', class: 'text-sm text-neutral-400 px-3 py-2', onclick: () => overlay.remove() }, 'Cancel'),
      el('button', { type: 'submit', class: 'ml-auto inline-flex items-center gap-1.5 bg-accent text-ink font-semibold text-sm px-4 py-2 rounded-lg' }, icon('plus', 'w-4 h-4'), 'Add & embed')),
  );
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(f);
    const num = (v) => v === '' ? null : Number(v);
    const list = (v) => String(v || '').split(',').map((x) => x.trim()).filter(Boolean);
    const payload = {
      name: fd.get('name').trim(), serving_size: fd.get('serving_size').trim() || null,
      calories: num(fd.get('calories')), protein_g: num(fd.get('protein_g')),
      carbs_g: num(fd.get('carbs_g')), fat_g: num(fd.get('fat_g')),
      cuisine: fd.get('cuisine').trim() || null, diet_type: fd.get('diet_type') || null,
      allergens: list(fd.get('allergens')), tags: list(fd.get('tags')),
    };
    if (!payload.name) { return _err(f, 'Name is required.'); }
    const btn = f.querySelector('button[type=submit]'); btn.disabled = true; btn.textContent = 'embedding…';
    try { await api.createFood(payload); overlay.remove(); renderFoodReset(body); }
    catch (err) { _err(f, err.message); btn.disabled = false; btn.textContent = 'Add & embed'; }
  });
  overlay.append(f);
  document.body.append(overlay);
}

function _foodSelect(label, name, opts) {
  return el('label', { class: 'block' },
    el('div', { class: 'text-xs text-neutral-500 mb-1' }, label),
    el('select', { name, class: 'w-full bg-ink border border-line rounded-lg px-3 py-2 text-sm focus:border-accent outline-none' },
      ...opts.map((o) => el('option', { value: o }, o || '—'))));
}
function _err(f, msg) { const b = f.querySelector('#food-err'); b.textContent = msg; b.classList.remove('hidden'); }

async function renderExercises(body) {
  const slot = el('div', {}, spinner('Loading exercises…'));
  body.append(slot);
  let list;
  try { list = await api.exercises(); }
  catch (e) { slot.replaceChildren(errorBox(e)); return; }

  const toolbar = el('div', { class: 'flex items-center mb-4' },
    el('div', { class: 'text-sm text-neutral-500' }, `${list.length} exercises`),
    el('button', { class: 'ml-auto inline-flex items-center gap-1.5 bg-accent text-ink font-semibold text-sm px-3 py-1.5 rounded-lg hover:bg-accentDim',
      onclick: () => openForm(body, null) }, icon('plus', 'w-4 h-4'), 'Add exercise'),
  );

  const grid = el('div', { class: 'grid sm:grid-cols-2 lg:grid-cols-3 gap-4' });
  for (const ex of list) {
    const img = ex.image_url ? (ex.image_url.startsWith('http') ? ex.image_url : API_BASE + ex.image_url) : null;
    const fallback = () => { const i = icon('dumbbell', 'w-6 h-6'); i.classList.add('text-neutral-600'); return i; };
    grid.append(card(
      el('div', { class: 'flex gap-3' },
        el('div', { class: 'w-16 h-16 rounded-lg bg-ink border border-line shrink-0 overflow-hidden flex items-center justify-center' },
          img ? el('img', { src: img, class: 'w-full h-full object-cover', onerror: function () { this.replaceWith(fallback()); } }) : fallback()),
        el('div', { class: 'min-w-0' },
          el('div', { class: 'font-bold truncate' }, ex.display_name || ex.slug),
          el('div', { class: 'text-xs text-neutral-500' }, ex.slug),
          el('div', { class: 'flex flex-wrap gap-1 mt-1.5' },
            ex.muscle_group ? pill(ex.muscle_group, 'accent') : null,
            ex.sets ? pill(`sets ${ex.sets.join('/')}`) : null,
          ),
        ),
      ),
      el('div', { class: 'flex items-center gap-2 mt-3 pt-3 border-t border-line' },
        el('span', { class: 'text-[11px] text-neutral-600 truncate flex-1' }, ex.trainer_config || 'no trainer cfg'),
        el('button', { class: 'inline-flex items-center gap-1 text-xs text-neutral-400 hover:text-accent', onclick: () => openForm(body, ex) }, icon('edit', 'w-3.5 h-3.5'), 'Edit'),
        el('button', { class: 'inline-flex items-center gap-1 text-xs text-neutral-400 hover:text-danger', onclick: async () => {
          if (!confirm(`Delete "${ex.slug}"?`)) return;
          await api.deleteExercise(ex.slug); renderDatabaseReset(body);
        } }, icon('trash', 'w-3.5 h-3.5'), 'Delete'),
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
      box.textContent = err.message;
      box.classList.remove('hidden');
    }
  });
  form.append(f);
  document.body.append(form);
}

const splitList = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);
