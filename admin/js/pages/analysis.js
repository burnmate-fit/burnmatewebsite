import { el, header } from '../ui.js';
import { icon } from '../icons.js';

// Intentionally just a heading for now — nothing dynamic decided yet.
export async function renderAnalysis(view) {
  const ic = icon('bar-chart', 'w-7 h-7'); ic.classList.add('text-neutral-600');
  view.append(
    header('Analysis'),
    el('div', { class: 'rounded-xl border border-dashed border-line bg-surface/40 p-12 text-center' },
      el('div', { class: 'inline-flex items-center justify-center w-14 h-14 rounded-xl border border-line mb-4' }, ic),
      el('p', { class: 'text-neutral-500 text-sm' },
        'Reserved for analytics. Nothing wired up yet — we have the data ',
        el('span', { class: 'text-neutral-400' }, '(workout_sessions / workout_events)'),
        ' when we decide what to chart.'),
    ),
  );
}
