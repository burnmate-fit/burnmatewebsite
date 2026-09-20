// Rule Cards — what each shipped exercise coaches, as a picture and a table.
//
// Everything here is read from what the DEVICE actually runs: the rule table
// and every voice filename come from the live tracker config in the registry,
// and the card is drawn from the CM5's own test rig, so neither can drift from
// the rules the board is scoring. Read-only on purpose -- the Exercise Editor
// is where configs are changed.
import { api, API_BASE } from '../api.js';
import { el, header, card } from '../ui.js';

const PRETTY = {
  squat: 'Squat',
  squat_front: 'Squat (front view)',
  reverse_lunges: 'Reverse Lunges',
  bird_dog: 'Bird-Dog',
  knee_push_up: 'Knee Push-up',
  overhead_press: 'Overhead Press',
  toe_touch: 'Standing Toe Touch',
  high_knee_raise: 'Standing Knee Raise',
  vrikshasana: 'Vrikshasana (Tree Pose)',
};

const WHEN = {
  any: 'any time',
  at_rest: 'at the start position',
  at_top: 'at the start position',
  top: 'near the start position',
  at_work: 'at the working end',
  at_bottom: 'at the working end',
  bottom: 'deep in the movement',
  mid: 'mid movement',
  travel: 'while moving',
  moving: 'while moving',
  toward_work: 'on the way down',
  toward_rest: 'on the way back',
};

// The limit a rule actually judges, whichever of the many shapes it uses.
function limitOf(r) {
  const parts = [];
  const num = (k, label) => {
    if (r[k] !== undefined && r[k] !== null) parts.push(`${label} ${r[k]}`);
  };
  num('target_angle', 'target');
  num('min_deg', 'min');
  num('max_deg', 'max');
  num('min_ratio', 'min ratio');
  num('max_ratio', 'max ratio');
  num('min_offset', 'min offset');
  num('max_offset', 'max offset');
  num('max_drift', 'max drift');
  num('max_drop', 'max drop');
  num('target', 'target');
  num('tolerance', '±');
  num('min_s', 'min s');
  num('max_s', 'max s');
  return parts.join(', ') || '—';
}

function colourBadge(r) {
  const red = r.visual_level === 'error';
  const esc = !!r.escalate_to_red_after_cue;
  const label = r.silent ? 'SILENT' : red ? 'RED' : esc ? 'AMBER → RED' : 'AMBER';
  const cls = r.silent
    ? 'bg-neutral-800 text-neutral-400 border-neutral-700'
    : red
      ? 'bg-danger/15 text-danger border-danger/30'
      : 'bg-amber-500/10 text-amber-400 border-amber-500/30';
  return el('span', { class: `text-[11px] font-semibold px-2 py-0.5 rounded border ${cls}` }, label);
}

function clip(slug, file) {
  if (!file) return el('span', { class: 'text-neutral-600' }, '—');
  return el('div', { class: 'font-mono text-[11px] text-neutral-400 leading-relaxed' },
    file.replace(/^feedback\//, ''),
    el('div', { class: 'text-neutral-600' }, `assets/voice/exercises/${slug}/${file}`));
}

function contractLine(cfg) {
  const t = cfg.tuning || {};
  const th = cfg.thresholds || {};
  const bits = [
    `${cfg.view || '?'} view`,
    `camera ${cfg.camera_yaw_deg ?? '?'}°`,
  ];
  if (t.rep_count_mode === 'hold') {
    const h = t.hold || {};
    bits.push(`HOLD ${h.seconds}s per side`,
      `sides ${(h.sides || []).join(' → ')}`,
      `settle ${h.settle_s}s`, `forgives ${h.grace_s}s`, `change legs ${h.switch_rest_s}s`);
  } else {
    bits.push(`counts on ${(cfg.joints?.left || []).join('-').toLowerCase() || 'the rep joint'}`,
      `work ${th.down_angle}`, `rest ${th.up_angle}`,
      `slack ${t.count_slack_deg ?? '—'}`, `mode ${t.rep_count_mode || 'rebound'}`);
  }
  return bits.join(' · ');
}

function rulesTable(slug, cfg) {
  const head = ['rule', 'what it says', 'colour', 'cancels rep', 'judged', 'limit', 'voice clip', 'short clip'];
  const table = el('table', { class: 'w-full text-sm' },
    el('thead', {},
      el('tr', { class: 'text-left text-[11px] uppercase tracking-wide text-neutral-500 border-b border-line' },
        head.map((h) => el('th', { class: 'py-2 pr-3 font-semibold' }, h)))));
  const body = el('tbody', {});
  (cfg.feedback_rules || []).forEach((r) => {
    body.append(el('tr', { class: 'border-t border-line/60 align-top' },
      el('td', { class: 'py-2.5 pr-3 whitespace-nowrap' },
        el('div', { class: 'font-mono text-[12px] text-neutral-300' }, r.name),
        el('div', { class: 'text-[11px] text-neutral-600' }, r.type || '')),
      el('td', { class: 'py-2.5 pr-3 text-neutral-200 min-w-[200px]' },
        r.silent ? el('span', { class: 'text-neutral-500' }, '(says nothing — it only blocks)')
          : `“${r.feedback || ''}”`,
        r.short ? el('div', { class: 'text-[11px] text-neutral-500 mt-0.5' }, `in a list: “${r.short}”`) : null),
      el('td', { class: 'py-2.5 pr-3' }, colourBadge(r)),
      el('td', { class: 'py-2.5 pr-3' }, r.blocks_rep
        ? el('span', { class: 'text-danger font-semibold text-[12px]' }, 'YES')
        : el('span', { class: 'text-neutral-600' }, '—')),
      el('td', { class: 'py-2.5 pr-3 text-neutral-400 text-[12px] whitespace-nowrap' },
        WHEN[r.phase] || r.phase || 'any time'),
      el('td', { class: 'py-2.5 pr-3 text-neutral-400 text-[12px] whitespace-nowrap' }, limitOf(r)),
      el('td', { class: 'py-2.5 pr-3' }, clip(slug, r.voice)),
      el('td', { class: 'py-2.5 pr-3' }, clip(slug, r.voice_short))));
    // The evidence behind the number, kept folded away -- these notes are long
    // and quote the board session the limit was tuned on.
    if (r.source) {
      body.append(el('tr', {},
        el('td', { colspan: '8', class: 'pb-3' },
          el('details', { class: 'text-[12px] text-neutral-500' },
            el('summary', { class: 'cursor-pointer text-neutral-500 hover:text-neutral-300' },
              'why this limit'),
            el('p', { class: 'mt-1.5 leading-relaxed text-neutral-400 whitespace-pre-wrap' }, r.source)))));
    }
  });
  table.append(body);
  return el('div', { class: 'overflow-x-auto' }, table);
}

function otherCues(slug, cfg) {
  const rows = [];
  const push = (when, obj) => {
    if (obj && (obj.text || obj.voice)) rows.push([when, obj.text || '', obj.voice || '']);
  };
  push('before the set / out of position', cfg.setup_cue);
  push('a good rep', cfg.work_ok_cue);
  push('a rep that did not count', cfg.rep_not_counted_cue);
  push('stance is right', cfg.stance_ok_cue);
  push('ready to start', cfg.stance_ready_cue);
  const t = cfg.tuning || {};
  if (t.depth_cue) rows.push(['the rep was short', t.depth_cue, t.depth_voice || '']);
  Object.entries(cfg.hold_cues || {}).forEach(([k, v]) => {
    push(`hold: ${k.replace(/_/g, ' ')}`, v);
  });
  if (!rows.length) return null;
  const table = el('table', { class: 'w-full text-sm' },
    el('thead', {}, el('tr', { class: 'text-left text-[11px] uppercase tracking-wide text-neutral-500 border-b border-line' },
      ['when', 'what it says', 'voice clip'].map((h) => el('th', { class: 'py-2 pr-3 font-semibold' }, h)))));
  const body = el('tbody', {});
  rows.forEach(([when, text, voice]) => body.append(
    el('tr', { class: 'border-b border-line/60 align-top' },
      el('td', { class: 'py-2.5 pr-3 text-neutral-400 text-[12px]' }, when),
      el('td', { class: 'py-2.5 pr-3 text-neutral-200' }, `“${text}”`),
      el('td', { class: 'py-2.5 pr-3' }, clip(slug, voice)))));
  table.append(body);
  return el('div', { class: 'overflow-x-auto' }, table);
}

function gateNote(cfg) {
  const gate = cfg.mandatory_rules || [];
  if (!gate.length) return null;
  const names = gate.map((g) => (g.joints || []).join(' vs ').toLowerCase()).join('; ');
  return el('div', { class: 'rounded-lg border border-line bg-black/20 p-4 text-sm text-neutral-300' },
    el('div', { class: 'font-semibold text-neutral-200 mb-1' }, 'Start-position gate'),
    `A rep is credited only after this was seen since the last one: ${names}. `,
    'Nothing is said when it fails; the setup cue above is what asks for it.');
}

export async function renderRules(view) {
  view.append(header('Rule Cards',
    'Every shipped exercise: the picture the rules draw, what each fault says, and the exact clip it plays. Read from the live tracker config.'));

  const wrap = el('div', { class: 'grid grid-cols-[210px_1fr] gap-6 items-start' });
  const list = el('div', { class: 'rounded-xl border border-line bg-surface p-2 space-y-1' });
  const panel = el('div', {});
  wrap.append(list, panel);
  view.append(wrap);

  let cards = [];
  try {
    cards = (await api.exerciseCards()).cards || [];
  } catch (e) {
    panel.append(el('div', { class: 'text-danger text-sm' }, `Could not list cards: ${e.message}`));
  }
  const slugs = cards.map((c) => c.slug);
  const byslug = Object.fromEntries(cards.map((c) => [c.slug, c]));
  if (!slugs.length) {
    list.append(el('div', { class: 'text-neutral-500 text-sm p-2' }, 'No cards published yet.'));
    return;
  }

  async function show(slug) {
    list.querySelectorAll('button').forEach((b) =>
      b.classList.toggle('bg-white/[0.05]', b.dataset.slug === slug));
    panel.innerHTML = '';
    panel.append(el('div', { class: 'text-neutral-500 text-sm' }, 'Loading…'));
    let cfg;
    try {
      cfg = await api.trackerConfig(slug);
    } catch (e) {
      panel.innerHTML = '';
      panel.append(el('div', { class: 'text-danger text-sm' },
        `No live tracker config for ${slug}: ${e.message}`));
      return;
    }
    const blocking = (cfg.feedback_rules || []).filter((r) => r.blocks_rep).length;
    panel.innerHTML = '';
    panel.append(
      el('div', { class: 'mb-4' },
        el('h2', { class: 'text-lg font-bold' }, PRETTY[slug] || slug),
        el('p', { class: 'text-neutral-500 text-[13px] mt-0.5' }, contractLine(cfg)),
        el('p', { class: 'text-neutral-500 text-[13px]' },
          `${(cfg.feedback_rules || []).length} rules · ${blocking} cancel the rep`)),
      card(el('a', { href: `${API_BASE}${byslug[slug].url}`, target: '_blank', rel: 'noreferrer' },
        el('img', {
          src: `${API_BASE}${byslug[slug].url}?v=${byslug[slug].updated}`,
          alt: `${slug} rule card`,
          class: 'w-full rounded-lg border border-line',
        }))),
      el('h3', { class: 'text-sm font-semibold text-neutral-300 mt-7 mb-2' }, 'Every fault it can name'),
      card(rulesTable(slug, cfg)),
    );
    const cues = otherCues(slug, cfg);
    if (cues) {
      panel.append(el('h3', { class: 'text-sm font-semibold text-neutral-300 mt-7 mb-2' },
        'What it says outside a fault'), card(cues));
    }
    const gate = gateNote(cfg);
    if (gate) panel.append(el('div', { class: 'mt-6' }, gate));
  }

  slugs.forEach((slug) => {
    list.append(el('button', {
      'data-slug': slug,
      class: 'w-full text-left px-3 py-2 rounded-lg text-[13px] text-neutral-300 hover:bg-white/[0.04]',
      onclick: () => show(slug),
    }, PRETTY[slug] || slug));
  });
  await show(slugs[0]);
}
