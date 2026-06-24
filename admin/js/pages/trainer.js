import { api } from '../api.js';
import { el, header, card, spinner, errorBox, pill } from '../ui.js';
import { icon } from '../icons.js';
import { AvatarPlayer } from '../avatar.js';
import { deriveRep, buildTrackerConfig } from '../solver.js';

let player = null;

// a blank exercise skeleton for "New" — stand + bottom seeded from the rig rest pose
const NEW_ANIM = {
  schema_version: 1, mode: 'ik_3d', view: 'side',
  solver: { type: 'two_bone', allow_stretch: false },
  body: { shoulder_width: 0.36, hip_width: 0.20 },
  chains: { left_leg: { hint: [0, 0, 1] }, right_leg: { hint: [0, 0, 1] }, left_arm: { hint: [0, -1, 0.18] }, right_arm: { hint: [0, -1, 0.18] } },
  contacts: { pinned: ['l_ankle', 'r_ankle'] },
  phases: [
    { name: 'stand', from: 'stand', to: 'stand' },
    { name: 'descend', from: 'stand', to: 'bottom' },
    { name: 'bottom', from: 'bottom', to: 'bottom' },
    { name: 'ascend', from: 'bottom', to: 'stand' },
    { name: 'return_stand', from: 'stand', to: 'stand' },
  ],
  keyframes: { stand: {}, bottom: {} }, // beginEdit seeds targets
};

export async function renderTrainer(view) {
  view.append(header('Trainer Designer', 'Pose the avatar to design an exercise — drag the joints, set the rep, save it.'));
  const slot = el('div', {}, spinner('Loading exercises…'));
  view.append(slot);

  let exercises;
  try { exercises = await api.exercises(); }
  catch (e) { slot.replaceChildren(errorBox(e)); return; }

  const stage = el('div', { class: 'rounded-xl border border-line bg-ink overflow-hidden', style: 'height:540px' });
  const panel = el('div', {});
  const select = el('select', { class: 'bg-ink border border-line rounded-lg px-3 py-2 text-sm focus:border-accent outline-none' },
    el('option', { value: '' }, '— pick an exercise —'),
    ...exercises.filter((e) => e.trainer_config).map((e) => el('option', { value: e.slug }, e.display_name || e.slug)));
  const newBtn = el('button', { class: 'inline-flex items-center gap-1.5 text-sm border border-line rounded-lg px-3 py-2 text-neutral-200 hover:border-accent' }, icon('plus', 'w-4 h-4'), 'New exercise');

  slot.replaceChildren(
    el('div', { class: 'flex items-center gap-3 mb-4' }, select, newBtn),
    el('div', { class: 'grid lg:grid-cols-[1.5fr_1fr] gap-6' }, card(stage), panel),
  );

  player = new AvatarPlayer(stage);

  select.addEventListener('change', () => { if (select.value) previewMode(panel, select.value, exercises); });
  newBtn.addEventListener('click', () => { select.value = ''; editMode(panel, null, exercises); });

  // start by previewing the first real exercise, if any
  const first = exercises.find((e) => e.trainer_config);
  if (first) { select.value = first.slug; previewMode(panel, first.slug, exercises); }
  else editMode(panel, null, exercises);
}

// ── PREVIEW: play the saved config ──────────────────────────────────────────
async function previewMode(panel, slug, exercises) {
  player.endEdit();
  panel.replaceChildren(spinner('Loading config…'));
  let cfg;
  try { cfg = await api.trainerConfig(slug); }
  catch (e) { panel.replaceChildren(errorBox(e)); return; }
  player.setConfig(cfg.trainer_animation);

  const depth = el('input', { type: 'range', min: '0', max: '100', value: '0', class: 'flex-1 accent-accent' });
  const playBtn = el('button', { class: 'inline-flex items-center gap-1.5 bg-accent text-ink font-semibold text-sm px-4 py-2 rounded-lg' });
  const setPlay = (p) => playBtn.replaceChildren(icon(p ? 'pause' : 'play', 'w-4 h-4'), p ? 'Pause' : 'Play');
  setPlay(false);
  const editBtn = el('button', { class: 'inline-flex items-center gap-1.5 text-sm border border-line rounded-lg px-3 py-2 hover:border-accent' }, icon('edit', 'w-4 h-4'), 'Edit this');

  playBtn.onclick = () => { if (player.playing) { player.pause(); setPlay(false); } else { player.play(); setPlay(true); } };
  player.onDepth = (d) => { depth.value = Math.round(d * 100); };
  depth.oninput = () => { player.pause(); setPlay(false); player.setDepth(depth.value / 100); };
  editBtn.onclick = () => editMode(panel, { slug, cfg }, exercises);

  panel.replaceChildren(
    card(
      el('div', { class: 'flex items-center gap-2 mb-3' }, pill(cfg.file), pill(`${Object.keys(cfg.trainer_animation.keyframes || {}).length} keyframes`, 'accent')),
      el('div', { class: 'flex items-center gap-3' }, playBtn,
        el('div', { class: 'flex items-center gap-2 flex-1' }, el('span', { class: 'text-xs text-neutral-500' }, 'depth'), depth)),
      el('div', { class: 'mt-3' }, editBtn),
    ),
    card(el('div', { class: 'text-xs text-neutral-500 leading-relaxed' },
      el('span', { class: 'text-accent font-semibold' }, 'Parity: '),
      'this avatar is a direct port of the CM5 solver — what you design here is what the board shows.')),
  );
}

// ── EDIT: pose the sequence Start → Success → End; auto-derive the rep ───────
const STEP_KF = { Start: 'stand', 'Success 1': 'bottom', 'Success 2': 'bottom2' };

function editMode(panel, existing, exercises) {
  const isNew = !existing;
  const baseAnim = existing ? JSON.parse(JSON.stringify(existing.cfg.trainer_animation)) : JSON.parse(JSON.stringify(NEW_ANIM));
  const slug = existing ? existing.slug : '';
  const meta = existing ? exercises.find((e) => e.slug === slug) || {} : {};

  let forcedJoint = null, strictness = 'medium';

  player.beginEdit(baseAnim, () => refreshDerived());
  // seed any empty keyframe so the handles show + dragging works
  for (const k of player.keyframeNames()) {
    const t = player.editAnim.keyframes[k].targets;
    if (!t || !Object.keys(t).length) player.editAnim.keyframes[k].targets = player._defaultTargets();
  }
  player.renderEditPose(); // re-render now that targets are seeded (handles appear)
  const hasS2 = () => !!player.editAnim.keyframes.bottom2;
  const steps = () => ['Start', 'Success 1', ...(hasS2() ? ['Success 2'] : [])];
  let current = 'Start';
  const selectStep = (label) => { current = label; player.setEditKeyframe(STEP_KF[label]); renderTabs(); };

  // ── sequence tabs ──
  const tabBar = el('div', { class: 'flex flex-wrap gap-2 items-center' });
  function renderTabs() {
    tabBar.replaceChildren();
    steps().forEach((label, i) => {
      tabBar.append(
        i ? el('span', { class: 'text-neutral-600' }, '→') : null,
        el('button', {
          class: `px-3 py-1.5 rounded-lg text-sm font-medium border ${label === current ? 'border-accent text-accent bg-accent/10' : 'border-line text-neutral-400'}`,
          onclick: () => selectStep(label),
        }, label),
      );
    });
    if (!hasS2()) tabBar.append(
      el('button', { class: 'px-2 py-1.5 rounded-lg text-sm border border-dashed border-line text-neutral-500 hover:text-accent',
        onclick: () => { player.editAnim.keyframes.bottom2 = { targets: JSON.parse(JSON.stringify(player.editAnim.keyframes.bottom.targets)) }; selectStep('Success 2'); } },
        '+ Success 2'));
    tabBar.append(el('span', { class: 'text-neutral-600' }, '→'),
      el('span', { class: 'px-3 py-1.5 rounded-lg text-sm border border-line text-neutral-600' }, 'End = Start'));
  }
  renderTabs();

  // ── pose controls ──
  const mirror = el('input', { type: 'checkbox', class: 'accent-accent', checked: 'true' });
  mirror.onchange = () => { player.mirror = mirror.checked; }; player.mirror = true;
  const viewBtn = el('button', { class: 'text-sm border border-line rounded-lg px-3 py-1.5 text-neutral-300' }, `${player.view} view`);
  viewBtn.onclick = () => { player.view = player.view === 'side' ? 'front' : 'side'; player._applyView(); player.renderEditPose(); viewBtn.textContent = `${player.view} view`; };
  const resetBtn = el('button', { class: 'text-sm border border-line rounded-lg px-3 py-1.5 text-neutral-400 hover:text-danger' }, 'Reset pose');
  resetBtn.onclick = () => { player.editAnim.keyframes[player.editKf].targets = player._defaultTargets(); player.renderEditPose(); refreshDerived(); };

  // ── auto-derived rep readout ──
  const derivedBox = el('div', { class: 'text-sm' });
  const jointSel = el('select', { class: inpCls() },
    el('option', { value: 'auto' }, 'Auto-detect'),
    ...['knee', 'elbow', 'hip', 'shoulder'].map((j) => el('option', { value: j }, j)));
  jointSel.onchange = () => { forcedJoint = jointSel.value === 'auto' ? null : jointSel.value; refreshDerived(); };

  function currentRep() {
    const k = player.editAnim.keyframes;
    return deriveRep(k.stand.targets, k.bottom.targets, player.editAnim, forcedJoint);
  }
  function refreshDerived() {
    const d = currentRep();
    if (!d) { derivedBox.replaceChildren(el('span', { class: 'text-neutral-500' }, 'pose Start + Success to detect')); return; }
    derivedBox.replaceChildren(
      el('div', { class: 'flex items-center gap-2 flex-wrap' },
        pill(`driver: ${d.joint}`, 'accent'),
        pill(`down ${d.down_angle}°`), pill(`up ${d.up_angle}°`),
        el('span', { class: 'text-xs text-neutral-500' }, `(${d.delta}° travel)`)),
    );
  }

  // ── fields (defaults, editable) ──
  const nameIn = inp('e.g. Jumping Jack', meta.display_name || '');
  const slugIn = inp('e.g. jumping_jack', slug); if (existing) slugIn.setAttribute('readonly', 'true');
  const muscleIn = inp('e.g. Full Body', meta.muscle_group || '');
  const repsIn = inp('10', '10', 'number');
  const setsIn = inp('3', '3', 'number');
  const restIn = inp('45', '45', 'number');
  const strictSel = el('select', { class: inpCls() }, ...['loose', 'medium', 'strict'].map((s) => el('option', { value: s, selected: s === 'medium' ? 'true' : null }, s)));
  strictSel.onchange = () => { strictness = strictSel.value; };

  const saveBtn = el('button', { class: 'inline-flex items-center justify-center gap-1.5 w-full bg-accent text-ink font-semibold text-sm px-4 py-2.5 rounded-lg hover:bg-accentDim' }, icon('plus', 'w-4 h-4'), isNew ? 'Create exercise' : 'Save exercise');
  const status = el('div', { class: 'text-xs mt-2' });
  const say = (msg, tone) => { status.className = `text-xs mt-2 text-${tone}`; status.textContent = msg; };

  saveBtn.onclick = async () => {
    const s = (slugIn.value || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
    if (!s) return say('Slug is required.', 'danger');
    if (!nameIn.value.trim()) return say('Name is required.', 'danger');
    const d = currentRep();
    if (!d) return say('Pose Start + Success first.', 'danger');
    saveBtn.disabled = true; say('Saving…', 'neutral-400');
    try {
      const reps = Math.max(1, parseInt(repsIn.value) || 10);
      const numSets = Math.max(1, parseInt(setsIn.value) || 3);
      const exData = {
        slug: s, display_name: nameIn.value.trim(), muscle_group: muscleIn.value.trim() || null,
        trainer_config: `${s}_ik.json`, tracker_config: `${s}.json`,
        sets: Array(numSets).fill(reps), rest_seconds: Math.max(0, parseInt(restIn.value) || 45),
      };
      await api.saveTrainerConfig(s, { trainer_animation: player.getEditedAnim() });   // animation
      await api.saveTrackerConfig(s, buildTrackerConfig(s, d, strictness));            // rep detection
      const exists = exercises.some((e) => e.slug === s);
      if (exists) await api.updateExercise(s, exData); else await api.createExercise(exData);
      say(`Saved “${exData.display_name}” — animation + rep detection + registry.`, 'accent');
    } catch (e) {
      say(typeof e.message === 'string' ? e.message : 'Save failed.', 'danger');
    } finally { saveBtn.disabled = false; }
  };

  refreshDerived();
  panel.replaceChildren(
    card(
      el('div', { class: 'flex items-center gap-2 mb-3' }, pill(isNew ? 'new exercise' : slug, 'accent'),
        el('span', { class: 'text-xs text-neutral-500' }, 'drag the green handles to pose each step')),
      tabBar,
      el('div', { class: 'flex items-center gap-3 mt-4 flex-wrap' },
        el('label', { class: 'flex items-center gap-1.5 text-sm text-neutral-300' }, mirror, 'Mirror L/R'),
        viewBtn, resetBtn),
    ),
    card(
      el('div', { class: 'text-xs font-bold text-accent uppercase tracking-wide mb-2' }, 'Rep detection (auto)'),
      derivedBox,
      el('div', { class: 'mt-3 grid grid-cols-2 gap-3' }, labeled('Driver joint', jointSel), labeled('Strictness', strictSel)),
    ),
    card(
      el('div', { class: 'text-xs font-bold text-accent uppercase tracking-wide mb-3' }, 'Details'),
      labeled('Display name', nameIn), labeled('Slug (id)', slugIn), labeled('Muscle group', muscleIn),
      el('div', { class: 'grid grid-cols-3 gap-3' }, labeled('Reps', repsIn), labeled('Sets', setsIn), labeled('Rest (s)', restIn)),
      el('div', { class: 'mt-4' }, saveBtn, status),
    ),
  );
}

const inpCls = () => 'w-full bg-ink border border-line rounded-lg px-3 py-2 text-sm focus:border-accent outline-none';
const inp = (placeholder, value = '', type = 'text') => el('input', { type, class: inpCls(), placeholder, value });
function labeled(label, input) {
  return el('label', { class: 'block mb-3' }, el('div', { class: 'text-xs text-neutral-500 mb-1' }, label), input);
}
