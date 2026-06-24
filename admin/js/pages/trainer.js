import { api } from '../api.js';
import { el, header, card, spinner, errorBox, pill } from '../ui.js';
import { icon } from '../icons.js';
import { AvatarPlayer } from '../avatar.js';

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

// ── EDIT: drag joints to pose each keyframe ─────────────────────────────────
function editMode(panel, existing, exercises) {
  const isNew = !existing;
  const baseAnim = existing ? existing.cfg.trainer_animation : NEW_ANIM;
  const slug = existing ? existing.slug : '';
  player.beginEdit(baseAnim, null);

  // keyframe tabs
  const kfBar = el('div', { class: 'flex gap-2' });
  const renderKfTabs = () => {
    kfBar.replaceChildren();
    for (const name of player.keyframeNames()) {
      kfBar.append(el('button', {
        class: `px-3 py-1.5 rounded-lg text-sm font-medium border ${name === player.editKf ? 'border-accent text-accent bg-accent/10' : 'border-line text-neutral-400'}`,
        onclick: () => { player.setEditKeyframe(name); renderKfTabs(); },
      }, name));
    }
  };
  renderKfTabs();

  const mirror = el('input', { type: 'checkbox', class: 'accent-accent', checked: 'true' });
  mirror.onchange = () => { player.mirror = mirror.checked; };
  player.mirror = true;

  const viewBtn = el('button', { class: 'text-sm border border-line rounded-lg px-3 py-1.5 text-neutral-300' }, `${player.view} view`);
  viewBtn.onclick = () => { player.view = player.view === 'side' ? 'front' : 'side'; player._applyView(); player.renderEditPose(); viewBtn.textContent = `${player.view} view`; };

  const resetBtn = el('button', { class: 'text-sm border border-line rounded-lg px-3 py-1.5 text-neutral-400 hover:text-danger' }, 'Reset pose');
  resetBtn.onclick = () => { player.editAnim.keyframes[player.editKf].targets = player._defaultTargets(); player.renderEditPose(); };

  // meta inputs
  const nameIn = el('input', { class: inpCls(), placeholder: 'e.g. Jumping Jack', value: existing ? (exercises.find((e) => e.slug === slug)?.display_name || '') : '' });
  const slugIn = el('input', { class: inpCls(), placeholder: 'e.g. jumping_jack', value: slug });
  if (existing) slugIn.setAttribute('readonly', 'true');
  const muscleIn = el('input', { class: inpCls(), placeholder: 'e.g. Full Body', value: existing ? (exercises.find((e) => e.slug === slug)?.muscle_group || '') : '' });

  const saveBtn = el('button', { class: 'inline-flex items-center justify-center gap-1.5 w-full bg-accent text-ink font-semibold text-sm px-4 py-2.5 rounded-lg hover:bg-accentDim' }, 'Save exercise');
  const status = el('div', { class: 'text-xs mt-2' });

  saveBtn.onclick = async () => {
    const s = (slugIn.value || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
    if (!s) { status.className = 'text-xs mt-2 text-danger'; status.textContent = 'Slug is required.'; return; }
    saveBtn.disabled = true; status.className = 'text-xs mt-2 text-neutral-400'; status.textContent = 'Saving…';
    try {
      const trainerFile = existing ? undefined : `${s}_ik.json`;
      const exData = { slug: s, display_name: nameIn.value.trim() || s, muscle_group: muscleIn.value.trim() || null,
        trainer_config: trainerFile, sets: [12, 10, 8], rest_seconds: 45 };
      // 1) write the config (creates <slug>_ik.json for new exercises)
      await api.saveTrainerConfig(s, { trainer_animation: player.getEditedAnim() });
      // 2) upsert the registry entry
      const exists = exercises.some((e) => e.slug === s);
      if (exists) await api.updateExercise(s, exData); else await api.createExercise(exData);
      status.className = 'text-xs mt-2 text-accent'; status.textContent = `Saved “${exData.display_name}”.`;
    } catch (e) {
      status.className = 'text-xs mt-2 text-danger';
      status.textContent = typeof e.message === 'string' ? e.message : 'Save failed.';
    } finally { saveBtn.disabled = false; }
  };

  panel.replaceChildren(
    card(
      el('div', { class: 'flex items-center gap-2 mb-3' }, pill(isNew ? 'new exercise' : slug, 'accent'),
        el('span', { class: 'text-xs text-neutral-500' }, 'drag the green handles to pose')),
      el('div', { class: 'text-xs text-neutral-500 mb-2' }, 'Keyframe'),
      kfBar,
      el('div', { class: 'flex items-center gap-3 mt-3 flex-wrap' },
        el('label', { class: 'flex items-center gap-1.5 text-sm text-neutral-300' }, mirror, 'Mirror L/R'),
        viewBtn, resetBtn),
    ),
    card(
      el('div', { class: 'text-xs font-bold text-accent uppercase tracking-wide mb-3' }, 'Exercise details'),
      labeled('Display name', nameIn),
      labeled('Slug (id)', slugIn),
      labeled('Muscle group', muscleIn),
      el('div', { class: 'mt-4' }, saveBtn, status),
    ),
    card(el('div', { class: 'text-xs text-neutral-500 leading-relaxed' },
      'Drag hips, chest, hands and feet for each keyframe. The legs/arms solve with the same IK as the board. Rep-angle + checkpoint tuning come next.')),
  );
}

const inpCls = () => 'w-full bg-ink border border-line rounded-lg px-3 py-2 text-sm focus:border-accent outline-none';
function labeled(label, input) {
  return el('label', { class: 'block mb-3' }, el('div', { class: 'text-xs text-neutral-500 mb-1' }, label), input);
}
