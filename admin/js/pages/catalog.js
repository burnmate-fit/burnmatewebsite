// Catalog — browse the stored Food (rag_foods, 1014) and Exercise (exercises, 57)
// tables exactly as seeded, with search. Read-only viewer.
import { api } from '../api.js';
import { el, header, card, tabs, spinner, errorBox, pill } from '../ui.js';

const cell = 'px-2.5 py-1.5 whitespace-nowrap text-[12px] border-b border-neutral-100 dark:border-neutral-800';
const hcell = 'px-2.5 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide text-neutral-500 border-b-2 border-neutral-300 dark:border-neutral-700 sticky top-0 bg-white dark:bg-neutral-900';

function fmt(v) {
  if (v === null || v === undefined || v === '') return '—';
  if (Array.isArray(v)) return v.length ? v.join(', ') : '—';
  if (typeof v === 'boolean') return v ? '✓' : '✗';
  if (typeof v === 'number') return Number.isInteger(v) ? v : v.toFixed(1);
  return String(v);
}

function table(rows) {
  if (!rows || !rows.length) return el('p', { class: 'text-neutral-500 text-sm p-4' }, 'No rows.');
  const cols = Object.keys(rows[0]).filter((c) => c !== 'id');
  const thead = el('tr', {}, ...cols.map((c) => el('th', { class: hcell }, c)));
  const body = rows.map((r) => el('tr', { class: 'hover:bg-neutral-50 dark:hover:bg-neutral-800/50' },
    ...cols.map((c) => {
      const v = r[c];
      // colour the diet + safety cells so the table reads at a glance
      if (c === 'diet_type') {
        const tone = v === 'non-veg' ? 'danger' : v === 'vegan' ? 'accent' : 'neutral';
        return el('td', { class: cell }, pill(fmt(v), tone));
      }
      if (['knee_safety', 'lowerback_safety', 'shoulder_safety', 'wrist_safety', 'bp_safety', 'pregnancy_safety'].includes(c)) {
        const tone = v === 'AVOID' ? 'danger' : v === 'MODIFY' ? 'accent' : 'neutral';
        return el('td', { class: cell }, pill(fmt(v), tone));
      }
      return el('td', { class: cell }, fmt(v));
    })));
  return el('div', { class: 'overflow-auto max-h-[70vh] rounded-lg border border-neutral-200 dark:border-neutral-800' },
    el('table', { class: 'min-w-full border-collapse text-sm' },
      el('thead', {}, thead), el('tbody', {}, ...body)));
}

async function load(which, holder, q) {
  holder.replaceChildren(spinner('Loading…'));
  try {
    const d = which === 'foods' ? await api.catalogFoods(q) : await api.catalogExercises(q);
    const rows = which === 'foods' ? d.foods : d.exercises;
    holder.replaceChildren(
      el('p', { class: 'text-[12px] text-neutral-500 mb-2' },
        `${d.total} total in ${which === 'foods' ? 'rag_foods' : 'exercises'} table` +
        (q ? ` · showing ${rows.length} match "${q}"` : ` · showing ${rows.length}`)),
      table(rows));
  } catch (e) {
    holder.replaceChildren(errorBox(e));
  }
}

export function renderCatalog(view) {
  let which = 'foods';
  const holder = el('div', {});
  const search = el('input', {
    class: 'w-64 text-sm px-3 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent',
    placeholder: 'Search name / muscle…',
    oninput: debounce((e) => load(which, holder, e.target.value.trim()), 300),
  });
  const tabBar = tabs(
    [['foods', 'Foods (1014)'], ['exercises', 'Exercises (57)']],
    which,
    (id) => { which = id; search.value = ''; load(which, holder, ''); });

  view.append(
    header('Catalog', 'The stored Food & Exercise tables, exactly as seeded'),
    card(el('div', { class: 'flex items-center justify-between gap-3 mb-3 flex-wrap' }, tabBar, search), holder));
  load('foods', holder, '');
}

function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}
