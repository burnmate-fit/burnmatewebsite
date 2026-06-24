import { api } from '../api.js';
import { el, header, card, spinner, errorBox, pill } from '../ui.js';
import { icon } from '../icons.js';

// small numbered step badge for each pipeline stage
const step = (n) => el('span', { class: 'inline-flex items-center justify-center w-5 h-5 rounded-md bg-accent/15 text-accent text-xs font-bold' }, String(n));

export async function renderPipeline(view) {
  view.append(header('AI Pipeline', 'What goes in, the exact prompt we send, and what comes back — one screen.'));
  const slot = el('div', {}, spinner('Loading inputs, outputs & prompt…'));
  view.append(slot);

  let d;
  try { d = await api.pipeline(); }
  catch (e) { slot.replaceChildren(errorBox(e)); return; }

  // ── inputs ──
  const inputs = card(
    el('div', { class: 'flex items-center gap-2 mb-4' },
      step(1), el('h2', { class: 'font-bold' }, 'Inputs we collect'),
      pill('from the app', 'accent')),
    el('div', { class: 'grid sm:grid-cols-2 lg:grid-cols-3 gap-4' },
      ...d.inputs.map((g) => el('div', { class: 'rounded-lg border border-line p-3' },
        el('div', { class: 'text-xs font-bold text-accent uppercase tracking-wide mb-2' }, g.group),
        el('div', { class: 'space-y-2' },
          ...g.fields.map((f) => el('div', {},
            el('div', { class: 'flex items-center gap-2' },
              el('span', { class: 'text-sm font-medium' }, f.label),
              f.kind === 'free-text list' ? pill('list') : null,
            ),
            f.options
              ? el('div', { class: 'flex flex-wrap gap-1 mt-1' },
                  ...f.options.map((o) => el('span', { class: 'text-[11px] px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-400' }, o)))
              : null,
          )),
        ),
      )),
    ),
  );

  // ── prompt ──
  const prompt = card(
    el('div', { class: 'flex items-center gap-2 mb-3' },
      step(2), el('h2', { class: 'font-bold' }, 'Prompt sent to the model'),
      d.model ? pill(d.model) : null,
      d.max_output_tokens ? pill(`${d.max_output_tokens} max tokens`) : null,
      el('button', { class: 'ml-auto inline-flex items-center gap-1 text-xs text-neutral-400 hover:text-accent',
        onclick: () => navigator.clipboard.writeText(d.sample_prompt) }, icon('copy', 'w-3.5 h-3.5'), 'Copy'),
    ),
    el('pre', { class: 'text-[12px] leading-relaxed text-neutral-300 bg-ink rounded-lg p-4 max-h-[460px] overflow-auto whitespace-pre-wrap' },
      d.sample_prompt),
    el('p', { class: 'text-[11px] text-neutral-600 mt-2' }, 'Rendered live from a sample profile — real injected values + the embedded workout-rules JSON.'),
  );

  // ── outputs ──
  const outputs = card(
    el('div', { class: 'flex items-center gap-2 mb-4' }, step(3), el('h2', { class: 'font-bold' }, 'Outputs we get back')),
    el('div', { class: 'space-y-3' },
      ...d.outputs.map((o) => el('div', { class: 'rounded-lg border border-line p-3' },
        el('div', { class: 'flex items-center gap-2' },
          el('code', { class: 'text-accent text-sm' }, o.node),
          el('span', { class: 'text-neutral-500 text-xs' }, o.desc)),
        el('ul', { class: 'mt-2 space-y-1' },
          ...o.children.map((c) => el('li', { class: 'text-sm text-neutral-400 flex gap-2' },
            el('span', { class: 'text-accent' }, '↳'), c))),
      )),
    ),
  );

  slot.replaceChildren(el('div', { class: 'space-y-6' }, inputs, prompt, outputs));
}
