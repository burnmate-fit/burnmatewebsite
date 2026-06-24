import { el, header } from '../ui.js';

// Intentionally just a heading for now — nothing dynamic decided yet.
export async function renderAnalysis(view) {
  view.append(
    header('Analysis'),
    el('div', { class: 'rounded-xl border border-dashed border-line bg-surface/40 p-12 text-center' },
      el('div', { class: 'text-4xl mb-3 opacity-40' }, '📊'),
      el('p', { class: 'text-neutral-500 text-sm' },
        'Reserved for analytics. Nothing wired up yet — we have the data ',
        el('span', { class: 'text-neutral-400' }, '(workout_sessions / workout_events)'),
        ' when we decide what to chart.'),
    ),
  );
}
