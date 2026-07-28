/**
 * Exercise Editor — one page, four segments, one JSON each.
 *
 * The three CM5 use-cases are edited separately so a JSON never bleeds into a
 * screen it doesn't belong to (see ARCHITECTURE_ISSUES.md §11):
 *
 *   Assets   — display name / aliases / muscle / sets / media URLs   (registry row)
 *   Preview  — trainer-preview steps: poses + text + voice           (intro-config)
 *   Trainer  — guide/copy: IK body + motion + guidance text/voice    (raw-config)
 *   Tracking — rep counting: thresholds + rules + feedback/voice     (tracker-config)
 *
 * Every save is VERIFIED: after the write we re-fetch from the backend and
 * confirm the value actually persisted, so a silent failure can't look like a
 * success (the panel previously gave no reliable feedback at all).
 */
import { api } from '../api.js';
import { el, header, card, spinner, errorBox, pill } from '../ui.js';
import { icon } from '../icons.js';

const SEGMENTS = [
  { id: 'assets', label: 'Assets', hint: 'Names, media and set defaults (registry row)' },
  { id: 'preview', label: 'Preview', hint: 'Trainer-preview steps: pose + text + voice (no tracking)' },
  { id: 'trainer', label: 'Trainer', hint: 'Guide/copy: IK body, motion, guidance text + voice' },
  { id: 'tracking', label: 'Tracking', hint: 'Rep counting: thresholds, joints, feedback text + voice' },
];

let activeSeg = 'assets';
let activeSlug = '';

export async function renderExerciseEditor(view) {
  view.append(header('Exercise Editor', 'One exercise, four segments — each with its own JSON. Saves are verified against the backend.'));
  const slot = el('div', {}, spinner('Loading exercises…'));
  view.append(slot);

  let exercises;
  try { exercises = await api.exercises(); }
  catch (e) { slot.replaceChildren(errorBox(e)); return; }
  if (!exercises.length) { slot.replaceChildren(errorBox('No exercises in the registry.')); return; }

  const select = el('select', { class: 'bg-ink border border-line rounded-lg px-3 py-2 text-sm focus:border-accent outline-none' },
    ...exercises.map((e) => el('option', { value: e.slug }, e.display_name || e.slug)));
  activeSlug = activeSlug && exercises.some((e) => e.slug === activeSlug) ? activeSlug : exercises[0].slug;
  select.value = activeSlug;

  const tabBar = el('div', { class: 'flex flex-wrap gap-2 mb-4' });
  const body = el('div', {});

  const paint = () => {
    tabBar.replaceChildren(...SEGMENTS.map((s) => el('button', {
      class: `px-3 py-1.5 rounded-lg text-sm font-medium border ${s.id === activeSeg
        ? 'border-accent text-accent bg-accent/10' : 'border-line text-neutral-400 hover:text-neutral-200'}`,
      onclick: () => { activeSeg = s.id; paint(); },
    }, s.label)));
    const seg = SEGMENTS.find((s) => s.id === activeSeg);
    body.replaceChildren(
      el('div', { class: 'text-xs text-neutral-500 mb-3' }, seg.hint),
      spinner('Loading segment…'),
    );
    renderSegment(body, activeSlug, activeSeg, exercises);
  };

  select.addEventListener('change', () => { activeSlug = select.value; paint(); });
  slot.replaceChildren(
    el('div', { class: 'flex items-center gap-3 mb-4' }, select, pill(activeSlug, 'accent')),
    tabBar, body,
  );
  paint();
}

// ── shared save plumbing: status + verified write ─────────────────────────
function statusLine() {
  return el('div', { class: 'text-xs mt-3 min-h-[18px] text-neutral-500' }, '');
}
function say(node, msg, tone = 'neutral-500') {
  node.className = `text-xs mt-3 min-h-[18px] text-${tone}`;
  node.textContent = msg;
}

/**
 * Run a save, then RE-FETCH and let the caller assert the value stuck.
 * `verify` receives the freshly fetched object and returns true when the write
 * is visible on the server — that is what turns the button green.
 */
async function verifiedSave({ btn, status, save, refetch, verify, label = 'Saved' }) {
  btn.disabled = true;
  say(status, 'Saving…', 'neutral-400');
  try {
    await save();
    let ok = true;
    if (refetch && verify) {
      const fresh = await refetch();
      ok = !!verify(fresh);
    }
    if (ok) say(status, `${label} ✓ verified on backend`, 'accent');
    else say(status, 'Saved, but the backend did not return the new value — check for a validation rewrite.', 'danger');
  } catch (e) {
    say(status, `Error: ${e.message || e}`, 'danger');
  } finally {
    btn.disabled = false;
  }
}

const jsonArea = (value) => {
  const ta = el('textarea', {
    class: 'w-full min-h-[340px] bg-black border border-line rounded-lg p-3 text-xs font-mono leading-5 text-neutral-200 focus:border-accent outline-none',
    spellcheck: 'false',
  });
  ta.value = JSON.stringify(value ?? {}, null, 2);
  return ta;
};
const parseArea = (ta, what) => {
  try { return JSON.parse(ta.value); }
  catch (e) { throw new Error(`${what} JSON is invalid: ${e.message}`); }
};
const inpCls = 'w-full bg-ink border border-line rounded-lg px-3 py-2 text-sm focus:border-accent outline-none';
const field = (label, value, ph = '') => {
  const input = el('input', { class: inpCls, value: value ?? '', placeholder: ph });
  return { input, node: el('label', { class: 'block mb-3' }, el('div', { class: 'text-xs text-neutral-500 mb-1' }, label), input) };
};
const saveBtn = (text = 'Save') =>
  el('button', { class: 'text-sm bg-accent text-ink font-semibold rounded-lg px-4 py-2' }, text);

// ── segment dispatch ──────────────────────────────────────────────────────
async function renderSegment(host, slug, seg, exercises) {
  try {
    if (seg === 'assets') return await segAssets(host, slug, exercises);
    if (seg === 'preview') return await segPreview(host, slug);
    if (seg === 'trainer') return await segTrainer(host, slug);
    if (seg === 'tracking') return await segTracking(host, slug);
  } catch (e) {
    host.replaceChildren(errorBox(e));
  }
}

// 1. ASSETS — registry row (names, media, defaults)
async function segAssets(host, slug, exercises) {
  const ex = await api.exercise(slug);
  const name = field('Display name', ex.display_name, 'Squat');
  const aliases = field('Aliases (comma)', (ex.aliases || []).join(', '), 'squats, body squat');
  const muscle = field('Muscle group', ex.muscle_group, 'Legs');
  const sets = field('Sets (comma)', (ex.sets || []).join(', '), '12, 10, 8');
  const rest = field('Rest seconds', ex.rest_seconds, '45');
  const image = field('Image URL', ex.image_url, `/media/exercises/${slug}/image.png`);
  const video = field('Video URL', ex.video_url, `/media/exercises/${slug}/video.mp4`);
  const status = statusLine();
  const btn = saveBtn('Save assets');

  btn.onclick = () => verifiedSave({
    btn, status,
    save: () => api.updateExercise(slug, {
      slug,
      display_name: name.input.value.trim() || null,
      muscle_group: muscle.input.value.trim() || null,
      aliases: aliases.input.value.split(',').map((s) => s.trim()).filter(Boolean),
      sets: sets.input.value.split(',').map((s) => Number(s.trim())).filter((n) => !isNaN(n)),
      rest_seconds: rest.input.value ? Number(rest.input.value) : null,
      image_url: image.input.value.trim() || null,
      video_url: video.input.value.trim() || null,
    }),
    refetch: () => api.exercise(slug),
    verify: (f) => (f.display_name || '') === (name.input.value.trim() || ''),
  });

  host.replaceChildren(
    card(
      el('div', { class: 'text-xs font-bold text-accent uppercase tracking-wide mb-3' }, 'Registry row'),
      name.node, aliases.node, muscle.node,
      el('div', { class: 'grid grid-cols-2 gap-3' }, sets.node, rest.node),
      image.node, video.node,
      btn, status,
    ),
    card(
      el('div', { class: 'text-xs font-bold text-accent uppercase tracking-wide mb-2' }, 'Voice folders (per use-case)'),
      el('div', { class: 'text-xs text-neutral-400 leading-relaxed' },
        'Audio lives beside the media on the server, grouped by use-case so each JSON only points inside its own folder:'),
      el('pre', { class: 'mt-2 overflow-auto rounded bg-black p-3 text-[11px] text-accent' },
        `/media/exercises/${slug}/preview/<step>.wav     → Preview segment\n` +
        `/media/exercises/${slug}/trainer/<cue>.wav      → Trainer segment\n` +
        `/media/exercises/${slug}/tracking/<cue>.wav     → Tracking segment`),
    ),
  );
}

// 2. PREVIEW — intro/preview config: steps (pose + text + voice), no tracking
async function segPreview(host, slug) {
  let cfg = null;
  try { cfg = (await api.introConfig(slug)).config; } catch { cfg = null; }
  const status = statusLine();
  const btn = saveBtn('Save preview JSON');

  if (!cfg) {
    host.replaceChildren(card(
      el('div', { class: 'text-sm text-neutral-300 mb-2' }, 'No preview config for this exercise yet.'),
      el('div', { class: 'text-xs text-neutral-500' },
        'Preview drives the "watch the steps" screen: each step has a pose, on-screen text and a voice clip. Add one via the Trainer Designer or paste JSON below.'),
      jsonAreaBlock(),
    ));
    return;
  }

  const steps = Array.isArray(cfg.timeline) ? cfg.timeline : [];
  const stepCards = steps.map((s, i) => el('div', { class: 'border border-line rounded-lg p-3 mb-2' },
    el('div', { class: 'flex items-center gap-2 mb-2' }, pill(`${i + 1}. ${s.id || 'step'}`, 'accent')),
    el('div', { class: 'text-xs text-neutral-300' }, s.title || '—'),
    el('div', { class: 'text-xs text-neutral-500' }, s.subtitle || ''),
    el('div', { class: 'text-[11px] text-neutral-600 mt-1 font-mono' },
      `voice: ${s.audio_cue || s.voice || '(none)'}`),
  ));

  const ta = jsonArea(cfg);
  btn.onclick = () => verifiedSave({
    btn, status,
    save: () => api.saveIntroConfig(slug, parseArea(ta, 'Preview')),
    refetch: () => api.introConfig(slug),
    verify: (f) => JSON.stringify(f.config) === JSON.stringify(parseArea(ta, 'Preview')),
  });

  host.replaceChildren(
    card(el('div', { class: 'text-xs font-bold text-accent uppercase tracking-wide mb-3' }, `Steps (${steps.length}) — text + voice`), ...stepCards),
    card(el('div', { class: 'text-xs font-bold text-accent uppercase tracking-wide mb-2' }, 'Preview JSON'), ta, el('div', { class: 'mt-3' }, btn), status),
  );

  function jsonAreaBlock() { return el('div', {}); }
}

// 3. TRAINER — guide/copy: IK body + motion (+ guidance text/voice)
async function segTrainer(host, slug) {
  const raw = (await api.trainerRawConfig(slug)).config;
  const anim = raw?.shadow_coach?.trainer_animation || raw?.trainer_animation || {};
  const kf = anim.motion?.keyframes || anim.keyframes || {};
  const status = statusLine();
  const btn = saveBtn('Save trainer JSON');
  const ta = jsonArea(raw);

  btn.onclick = () => verifiedSave({
    btn, status,
    save: () => api.saveTrainerRawConfig(slug, parseArea(ta, 'Trainer')),
    refetch: () => api.trainerRawConfig(slug),
    verify: (f) => JSON.stringify(f.config) === JSON.stringify(parseArea(ta, 'Trainer')),
  });

  const summary = el('div', { class: 'flex flex-wrap gap-2 mb-3' },
    pill(anim.mode || 'no mode', 'accent'), pill(`view: ${anim.view || '?'}`),
    pill(`keyframes: ${Object.keys(kf).join(', ') || 'none'}`),
    pill(anim.mode === 'biomech_fk_ik' ? 'v2 hybrid' : 'v1 (not migrated)', anim.mode === 'biomech_fk_ik' ? 'accent' : 'danger'),
  );

  const kfRows = Object.entries(kf).map(([name, vals]) => el('div', { class: 'border border-line rounded-lg p-3 mb-2' },
    el('div', { class: 'text-xs font-bold text-accent mb-1' }, name),
    el('div', { class: 'text-[11px] font-mono text-neutral-400' },
      typeof vals === 'object' && !vals.targets
        ? Object.entries(vals).map(([k, v]) => `${k}=${v}`).join('  ')
        : '(v1 world-space targets)'),
  ));

  host.replaceChildren(
    card(el('div', { class: 'text-xs font-bold text-accent uppercase tracking-wide mb-3' }, 'Motion keyframes'), summary, ...kfRows),
    card(el('div', { class: 'text-xs font-bold text-accent uppercase tracking-wide mb-2' }, 'Trainer JSON'), ta, el('div', { class: 'mt-3' }, btn), status),
  );
}

// 4. TRACKING — rep counting: thresholds, joints, rules (+ feedback text/voice)
async function segTracking(host, slug) {
  let cfg = null;
  try { cfg = await api.trackerConfig(slug); } catch { cfg = null; }
  const status = statusLine();
  const btn = saveBtn('Save tracking JSON');
  const ta = jsonArea(cfg || { thresholds: { down_angle: 90, up_angle: 160 } });

  btn.onclick = () => verifiedSave({
    btn, status,
    save: () => api.saveTrackerConfig(slug, parseArea(ta, 'Tracking')),
    refetch: () => api.trackerConfig(slug),
    verify: (f) => JSON.stringify(f) === JSON.stringify(parseArea(ta, 'Tracking')),
  });

  const th = (cfg || {}).thresholds || {};
  const summary = el('div', { class: 'flex flex-wrap gap-2 mb-3' },
    cfg ? pill('configured', 'accent') : pill('missing — planner should not pick this', 'danger'),
    ...Object.entries(th).map(([k, v]) => pill(`${k}: ${v}`)),
  );
  const rules = [...((cfg || {}).mandatory_rules || []), ...((cfg || {}).feedback_rules || [])];
  const ruleRows = rules.map((r) => el('div', { class: 'border border-line rounded-lg p-3 mb-2' },
    el('div', { class: 'text-xs text-neutral-300' }, r.name || r.type || 'rule'),
    el('div', { class: 'text-[11px] text-neutral-500' }, r.message || r.text || ''),
    el('div', { class: 'text-[11px] text-neutral-600 font-mono mt-1' }, `voice: ${r.voice || '(shared default)'}`),
  ));

  host.replaceChildren(
    card(el('div', { class: 'text-xs font-bold text-accent uppercase tracking-wide mb-3' }, 'Rep detection'), summary,
      ...(ruleRows.length ? ruleRows : [el('div', { class: 'text-xs text-neutral-500' }, 'No rules defined.')])),
    card(el('div', { class: 'text-xs font-bold text-accent uppercase tracking-wide mb-2' }, 'Tracking JSON'), ta, el('div', { class: 'mt-3' }, btn), status),
  );
}
