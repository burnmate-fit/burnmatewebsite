// Food Data — the whole ingredient vector store (public.ingredients) that the
// weekly plans are built from. Two views of the same rows:
//   Tree:  store → category → ingredient → details (photo, every value, tags, source)
//   Table: every ingredient × every column, searchable and sortable
// Read-only. Unknown values are shown in amber: medical caps exclude them.
import { api } from '../api.js';
import { el, header, card, tabs, spinner, errorBox, pill } from '../ui.js';

const CATEGORY_LABEL = {
  grain: 'Grains & millets', pulse: 'Dals & pulses', vegetable: 'Vegetables', leafy_green: 'Leafy greens',
  root_tuber: 'Roots & tubers', fruit: 'Fruits', dairy: 'Dairy', egg: 'Eggs', meat: 'Meat', poultry: 'Poultry',
  fish: 'Fish', seafood: 'Seafood', nut_seed: 'Nuts & seeds', oil_fat: 'Oils & fats', spice_herb: 'Spices & herbs',
  sugar: 'Sugars', mushroom: 'Mushrooms', other: 'Other',
};
// per-100 g values every ingredient carries (same columns in every category)
const NUTRIENTS = [
  ['calories', 'Energy', 'kcal'], ['protein_g', 'Protein', 'g'], ['carbs_g', 'Carbs', 'g'], ['fat_g', 'Fat', 'g'],
  ['fiber_g', 'Fibre', 'g'], ['sugar_g', 'Free sugar', 'g'], ['sodium_mg', 'Sodium', 'mg'],
  ['potassium_mg', 'Potassium', 'mg'], ['sat_fat_g', 'Saturated fat', 'g'], ['phosphorus_mg', 'Phosphorus', 'mg'],
];
const MICROS = [
  ['calcium_mg', 'Calcium', 'mg'], ['iron_mg', 'Iron', 'mg'], ['magnesium_mg', 'Magnesium', 'mg'],
  ['zinc_mg', 'Zinc', 'mg'], ['vitc_mg', 'Vitamin C', 'mg'], ['folate_ug', 'Folate', 'µg'],
  ['vita_ug', 'Vitamin A', 'µg'], ['vitb1_mg', 'B1', 'mg'], ['vitb2_mg', 'B2', 'mg'], ['vitb3_mg', 'B3', 'mg'],
  ['vitb6_mg', 'B6', 'mg'], ['vitb12_ug', 'B12', 'µg'], ['cholesterol_mg', 'Cholesterol', 'mg'],
];
const DIET_DOT = {
  vegan: 'bg-emerald-400', vegetarian: 'bg-lime-400', eggatarian: 'bg-amber-300',
  pescatarian: 'bg-sky-400', non_veg: 'bg-rose-500',
};
const POPULARITY = { 1: 'Everyday', 2: 'Weekly', 3: 'Occasional' };
const COST = { 1: 'Cheap', 2: 'Medium', 3: 'Premium' };
const UNKNOWN = 'text-amber-400';

const isBlank = (v) => v === null || v === undefined || v === '';
const gaps = (r) => NUTRIENTS.filter(([k]) => isBlank(r[k])).map(([, label]) => label);
const num = (v, d = 1) => (isBlank(v) ? null : Number(v).toFixed(Number(v) % 1 === 0 ? 0 : d));
const arr = (v) => (Array.isArray(v) ? v : []);

function micros(r) {
  if (!r.micros) return {};
  try { return typeof r.micros === 'string' ? JSON.parse(r.micros) : r.micros; } catch { return {}; }
}

function thumb(r, size = 32) {
  const box = `w-[${size}px] h-[${size}px] rounded-md shrink-0 object-cover bg-neutral-800`;
  if (r.image_url) return el('img', { src: r.image_url, loading: 'lazy', class: box, alt: '' });
  return el('div', { class: `${box} flex items-center justify-center text-[11px] text-neutral-500 font-bold` },
    (r.name || '?').slice(0, 1));
}

function dietDot(d) {
  return el('span', { class: `inline-block w-2 h-2 rounded-full ${DIET_DOT[d] || 'bg-neutral-500'}`, title: d });
}

// ── tree view ───────────────────────────────────────────────────────────
function treeView(rows, state, rerender) {
  const byCat = {};
  rows.forEach((r) => { (byCat[r.category] ||= []).push(r); });
  const cats = Object.keys(byCat).sort((a, b) => byCat[b].length - byCat[a].length);
  if (!state.cat || !byCat[state.cat]) state.cat = cats[0];
  const items = (byCat[state.cat] || [])
    .filter((r) => !state.itemQuery || `${r.name} ${arr(r.local_names).join(' ')}`.toLowerCase()
      .includes(state.itemQuery.toLowerCase()))
    .sort((a, b) => (a.popularity - b.popularity) || a.name.localeCompare(b.name));
  const sel = items.find((r) => r.food_code === state.item) || items[0];
  state.item = sel ? sel.food_code : null;

  const node = 'rounded-lg border border-line bg-surface';
  const root = el('div', { class: `${node} p-4 text-center`, 'data-node': 'root' },
    el('div', { class: 'text-[11px] uppercase tracking-wide text-neutral-500' }, 'ingredients'),
    el('div', { class: 'text-3xl font-extrabold text-accent mt-1' }, String(rows.length)),
    el('div', { class: 'text-[11px] text-neutral-500 mt-1' }, `${cats.length} categories`));

  const catCol = cats.map((c) => {
    const list = byCat[c];
    const missing = list.filter((r) => gaps(r).length).length;
    const active = c === state.cat;
    return el('button', {
      class: `${node} w-full text-left px-3 py-2 hover:border-accent/60 ${active ? 'border-accent ring-1 ring-accent/40' : ''}`,
      'data-node': `cat:${c}`,
      onclick: () => { state.cat = c; state.item = null; state.itemQuery = ''; rerender(); },
    },
    el('div', { class: 'flex items-center justify-between gap-2' },
      el('span', { class: 'text-[13px] font-semibold' }, CATEGORY_LABEL[c] || c),
      el('span', { class: 'text-[12px] font-bold text-accent' }, String(list.length))),
    el('div', { class: 'flex items-center gap-1 mt-1.5' },
      ...list.filter((r) => r.image_url).slice(0, 4).map((r) => thumb(r, 20)),
      el('span', { class: `ml-auto text-[10px] ${missing ? UNKNOWN : 'text-neutral-500'}` },
        missing ? `${missing} with gaps` : 'complete')));
  });

  const itemSearch = el('input', {
    class: 'w-full text-[12px] px-2.5 py-1.5 mb-2 rounded-md border border-line bg-transparent',
    placeholder: `Search ${CATEGORY_LABEL[state.cat] || ''}…`, value: state.itemQuery || '',
    oninput: debounce((e) => { state.itemQuery = e.target.value; rerender(true); }, 250),
  });
  const itemCol = items.map((r) => {
    const g = gaps(r);
    const active = sel && r.food_code === sel.food_code;
    return el('button', {
      class: `${node} w-full text-left px-2.5 py-1.5 flex items-center gap-2.5 hover:border-accent/60 ${active ? 'border-accent ring-1 ring-accent/40' : ''}`,
      'data-node': `item:${r.food_code}`,
      onclick: () => { state.item = r.food_code; rerender(); },
    },
    thumb(r, 30),
    el('div', { class: 'min-w-0 flex-1' },
      el('div', { class: 'text-[12.5px] font-semibold truncate flex items-center gap-1.5' }, dietDot(r.diet_type), r.name),
      el('div', { class: 'text-[11px] text-neutral-500 truncate' },
        `${num(r.calories, 0)} kcal · P ${num(r.protein_g) ?? '?'} g` +
        (arr(r.local_names).length ? ` · ${arr(r.local_names).slice(0, 2).join(', ')}` : ''))),
    g.length ? el('span', { class: `text-[10px] ${UNKNOWN}`, title: `unknown: ${g.join(', ')}` }, '●') : null);
  });

  const columns = el('div', { class: 'relative grid gap-x-10 items-start', style: 'grid-template-columns: 150px 230px 290px minmax(320px, 1fr)' },
    el('div', { class: 'sticky top-4' }, root),
    el('div', { class: 'flex flex-col gap-2' }, ...catCol),
    el('div', { class: 'flex flex-col gap-1.5' }, itemSearch, ...itemCol,
      items.length ? null : el('p', { class: 'text-[12px] text-neutral-500' }, 'No match.')),
    el('div', { class: 'sticky top-4', 'data-node': 'detail' }, sel ? detail(sel) : el('div', {})));
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'absolute inset-0 w-full h-full pointer-events-none overflow-visible');
  columns.prepend(svg);
  requestAnimationFrame(() => drawLinks(columns, svg, state));
  return columns;
}

function drawLinks(container, svg, state) {
  if (!container.isConnected) return;
  const base = container.getBoundingClientRect();
  const rect = (sel) => { const n = container.querySelector(`[data-node="${sel}"]`); return n && n.getBoundingClientRect(); };
  const path = (a, b, strong) => {
    const x1 = a.right - base.left, y1 = a.top + a.height / 2 - base.top;
    const x2 = b.left - base.left, y2 = b.top + Math.min(b.height / 2, 24) - base.top;
    const mx = (x1 + x2) / 2;
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`);
    p.setAttribute('fill', 'none');
    p.setAttribute('stroke', strong ? '#84CC16' : '#3a4034');
    p.setAttribute('stroke-width', strong ? '1.8' : '1');
    svg.append(p);
  };
  svg.replaceChildren();
  const root = rect('root');
  container.querySelectorAll('[data-node^="cat:"]').forEach((n) => {
    path(root, n.getBoundingClientRect(), n.dataset.node === `cat:${state.cat}`);
  });
  const cat = rect(`cat:${state.cat}`);
  if (cat) {
    container.querySelectorAll('[data-node^="item:"]').forEach((n) => {
      path(cat, n.getBoundingClientRect(), n.dataset.node === `item:${state.item}`);
    });
  }
  const item = rect(`item:${state.item}`);
  const det = rect('detail');
  if (item && det) path(item, det, true);
}

function detail(r) {
  const m = micros(r);
  const row = (label, value, unit) => el('div', { class: 'flex justify-between gap-3 py-1 border-b border-line/60 text-[12px]' },
    el('span', { class: 'text-neutral-400' }, label),
    isBlank(value) ? el('span', { class: UNKNOWN }, 'unknown')
      : el('span', { class: 'font-semibold tabular-nums' }, `${num(value)} ${unit}`));
  const chips = (title, values, tone) => el('div', { class: 'mb-2' },
    el('div', { class: 'text-[10px] uppercase tracking-wide text-neutral-500 mb-1' }, title),
    el('div', { class: 'flex flex-wrap gap-1' },
      ...(values.length ? values.map((v) => pill(v, tone)) : [el('span', { class: 'text-[12px] text-neutral-500' }, 'none')])));
  return el('div', { class: 'rounded-xl border border-line bg-surface overflow-hidden' },
    r.image_url
      ? el('img', { src: r.image_url, class: 'w-full h-48 object-cover', alt: r.name })
      : el('div', { class: 'w-full h-32 flex items-center justify-center text-neutral-500 text-sm bg-neutral-900' }, 'No photo yet'),
    el('div', { class: 'p-4' },
      el('div', { class: 'flex items-center gap-2' }, dietDot(r.diet_type),
        el('h3', { class: 'text-lg font-extrabold' }, r.name)),
      arr(r.local_names).length ? el('p', { class: 'text-[12px] text-neutral-400 mt-0.5' }, arr(r.local_names).join(' · ')) : null,
      el('p', { class: 'text-[11px] text-neutral-500 mt-1' },
        `${r.food_code} · ${CATEGORY_LABEL[r.category] || r.category} · source ${r.source || '?'}${r.source_ref ? ` #${r.source_ref}` : ''}`),
      r.source_name ? el('p', { class: 'text-[11px] text-neutral-500' }, `as listed: ${r.source_name}`) : null,
      el('div', { class: 'grid grid-cols-2 gap-x-6 mt-4' },
        el('div', {},
          el('div', { class: 'text-[10px] uppercase tracking-wide text-neutral-500 mb-1' }, 'Per 100 g'),
          ...NUTRIENTS.map(([k, label, unit]) => row(label, r[k], unit))),
        el('div', {},
          el('div', { class: 'text-[10px] uppercase tracking-wide text-neutral-500 mb-1' }, 'Micronutrients per 100 g'),
          ...MICROS.filter(([k]) => !isBlank(m[k])).map(([k, label, unit]) => row(label, m[k], unit)),
          MICROS.some(([k]) => !isBlank(m[k])) ? null : el('p', { class: 'text-[12px] text-neutral-500' }, 'none recorded'))),
      el('div', { class: 'mt-4' },
        chips('Diet', [r.diet_type], 'accent'),
        chips('Allergens', arr(r.allergens), 'danger'),
        chips('Avoided by (restrictions)', arr(r.avoid_tags), 'neutral'),
        chips('Usual meals', arr(r.meal_slots), 'neutral'),
        chips('Ranking', [POPULARITY[r.popularity] || '?', COST[r.cost_tier] || '?',
          r.diabetic_friendly ? 'diabetic friendly' : 'not diabetic friendly'], 'neutral')),
      el('div', { class: 'mt-2 text-[12px] text-neutral-300' },
        `Portion: 1 ${r.household_unit} = ${num(r.unit_grams)} g · usual ${num(r.min_g, 0)}–${num(r.max_g, 0)} g per meal`),
      r.review_note ? el('p', { class: 'mt-2 text-[11px] text-neutral-500' }, `Note: ${r.review_note}`) : null,
      r.image_credit ? el('p', { class: 'mt-1 text-[11px] text-neutral-500' }, 'Photo: ',
        el('a', { href: r.image_page || r.image_url, target: '_blank', class: 'underline' }, `${r.image_credit} / Pexels`)) : null));
}

// ── table view ──────────────────────────────────────────────────────────
const TABLE_COLS = [
  ['image_url', ''], ['food_code', 'code'], ['name', 'name'], ['local_names', 'local names'], ['category', 'category'],
  ['diet_type', 'diet'], ['allergens', 'allergens'], ['avoid_tags', 'avoid'], ['meal_slots', 'meals'],
  ['popularity', 'pop'], ['cost_tier', 'cost'], ...NUTRIENTS.map(([k, label, unit]) => [k, `${label} ${unit}`]),
  ['household_unit', 'unit'], ['unit_grams', 'g/unit'], ['min_g', 'min g'], ['max_g', 'max g'],
  ['diabetic_friendly', 'diabetic ok'], ['source', 'source'], ['verified', 'verified'],
];

function tableView(rows, state, rerender) {
  const cell = 'px-2 py-1.5 whitespace-nowrap text-[12px] border-b border-line/70';
  const hcell = 'px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide text-neutral-500 border-b-2 border-line sticky top-0 bg-surface cursor-pointer select-none';
  const sorted = [...rows];
  if (state.sort) {
    const [k, dir] = state.sort;
    sorted.sort((a, b) => {
      const x = a[k], y = b[k];
      if (isBlank(x)) return 1; if (isBlank(y)) return -1;
      return (typeof x === 'number' ? x - y : String(x).localeCompare(String(y))) * dir;
    });
  }
  const head = el('tr', {}, ...TABLE_COLS.map(([k, label]) => el('th', {
    class: hcell,
    onclick: () => { state.sort = [k, state.sort && state.sort[0] === k ? -state.sort[1] : 1]; rerender(); },
  }, label + (state.sort && state.sort[0] === k ? (state.sort[1] > 0 ? ' ▲' : ' ▼') : ''))));
  const fmt = (k, v, r) => {
    if (k === 'image_url') return thumb(r, 26);
    if (k === 'diet_type') return el('span', { class: 'flex items-center gap-1.5' }, dietDot(v), v);
    if (k === 'category') return CATEGORY_LABEL[v] || v;
    if (k === 'popularity') return POPULARITY[v] || v;
    if (k === 'cost_tier') return COST[v] || v;
    if (isBlank(v)) return el('span', { class: UNKNOWN }, '—');
    if (Array.isArray(v)) return v.length ? v.join(', ') : el('span', { class: 'text-neutral-600' }, '·');
    if (typeof v === 'boolean') return v ? '✓' : '✗';
    if (typeof v === 'number') return num(v);
    return String(v);
  };
  const body = sorted.map((r) => el('tr', {
    class: 'hover:bg-white/[0.03] cursor-pointer',
    onclick: () => { state.view = 'tree'; state.cat = r.category; state.item = r.food_code; rerender(); },
  }, ...TABLE_COLS.map(([k]) => el('td', { class: cell }, fmt(k, r[k], r)))));
  return el('div', { class: 'overflow-auto max-h-[72vh] rounded-lg border border-line' },
    el('table', { class: 'min-w-full border-collapse' }, el('thead', {}, head), el('tbody', {}, ...body)));
}

// ── page ────────────────────────────────────────────────────────────────
function summary(rows, status) {
  const withPhoto = rows.filter((r) => r.image_url).length;
  const complete = rows.filter((r) => !gaps(r).length).length;
  const sources = {};
  rows.forEach((r) => { sources[r.source] = (sources[r.source] || 0) + 1; });
  const stat = (label, value, sub) => el('div', { class: 'rounded-lg border border-line bg-surface px-4 py-3' },
    el('div', { class: 'text-[11px] uppercase tracking-wide text-neutral-500' }, label),
    el('div', { class: 'text-xl font-extrabold mt-0.5' }, value),
    sub ? el('div', { class: 'text-[11px] text-neutral-500 mt-0.5' }, sub) : null);
  return el('div', { class: 'grid grid-cols-2 md:grid-cols-5 gap-3 mb-5' },
    stat('Ingredients', String(rows.length), 'raw, per 100 g'),
    stat('All 10 values known', `${complete}`, `${rows.length - complete} have gaps (amber)`),
    stat('With photo', `${withPhoto}`, `${rows.length - withPhoto} still to fetch`),
    stat('Sources', Object.entries(sources).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).slice(0, 2).join(' · '),
      Object.keys(sources).length > 2 ? `+${Object.keys(sources).length - 2} more` : ''),
    stat('Vector search', status && status.pgvector ? 'pgvector' : 'Python fallback',
      status && status.pgvector ? 'ranking inside Postgres' : 'pgvector not installed on server'));
}

function csv(rows) {
  const cols = TABLE_COLS.map(([k]) => k).filter((k) => k !== 'image_url').concat(['image_url']);
  const esc = (v) => {
    const s = Array.isArray(v) ? v.join('|') : (isBlank(v) ? '' : String(v));
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const text = [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
  const a = el('a', { href: URL.createObjectURL(new Blob([text], { type: 'text/csv' })), download: 'ingredients.csv' });
  a.click();
}

export async function renderFood(view) {
  view.append(header('Food Data', 'Every ingredient the weekly plans are built from — how it is categorised, tagged and valued'));
  const holder = el('div', {}, spinner('Loading ingredients…'));
  view.append(holder);
  let rows, status;
  try {
    [rows, status] = await Promise.all([api.foodData().then((d) => d.foods), api.status().catch(() => null)]);
  } catch (e) {
    holder.replaceChildren(errorBox(e));
    return;
  }
  const state = { view: 'tree', cat: null, item: null, itemQuery: '', query: '', catFilter: '', gapsOnly: false, sort: null };
  const body = el('div', {});
  const search = el('input', {
    class: 'w-56 text-sm px-3 py-1.5 rounded-lg border border-line bg-transparent', placeholder: 'Search all…',
    oninput: debounce((e) => { state.query = e.target.value.trim().toLowerCase(); draw(); }, 250),
  });
  const catSelect = el('select', {
    class: 'text-sm px-2 py-1.5 rounded-lg border border-line bg-surface',
    onchange: (e) => { state.catFilter = e.target.value; draw(); },
  }, el('option', { value: '' }, 'All categories'),
  ...Object.keys(CATEGORY_LABEL).filter((c) => rows.some((r) => r.category === c))
    .map((c) => el('option', { value: c }, CATEGORY_LABEL[c])));
  const gapsBox = el('label', { class: 'flex items-center gap-1.5 text-[12px] text-neutral-400' },
    el('input', { type: 'checkbox', onchange: (e) => { state.gapsOnly = e.target.checked; draw(); } }), 'only with gaps');
  const download = el('button', {
    class: 'text-[12px] px-3 py-1.5 rounded-lg border border-line hover:border-accent/60',
    onclick: () => csv(filtered()),
  }, 'Download CSV');
  const tabBar = el('div', {});

  function filtered() {
    return rows.filter((r) => (!state.catFilter || r.category === state.catFilter)
      && (!state.gapsOnly || gaps(r).length)
      && (!state.query || `${r.name} ${arr(r.local_names).join(' ')} ${r.food_code} ${r.category} ${arr(r.allergens).join(' ')}`
        .toLowerCase().includes(state.query)));
  }

  function draw(keepScroll) {
    const y = window.scrollY;
    tabBar.replaceChildren(tabs([['tree', 'Tree'], ['table', 'Table']], state.view, (id) => { state.view = id; draw(); }));
    const list = filtered();
    body.replaceChildren(state.view === 'tree' ? treeView(list, state, draw) : tableView(list, state, draw));
    if (keepScroll) window.scrollTo(0, y);
  }

  holder.replaceChildren(
    summary(rows, status),
    card(el('div', { class: 'flex items-center justify-between gap-3 flex-wrap' }, tabBar,
      el('div', { class: 'flex items-center gap-2 flex-wrap mb-6' }, search, catSelect, gapsBox, download)), body));
  const onResize = debounce(() => {
    if (!body.isConnected) { window.removeEventListener('resize', onResize); return; }
    draw(true);
  }, 200);
  window.addEventListener('resize', onResize);
  draw();
}

function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}
