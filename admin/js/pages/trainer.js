import { api, API_BASE } from '../api.js';
import { el, header, card, spinner, errorBox, pill } from '../ui.js';
import { icon } from '../icons.js';
import { AvatarPlayer } from '../avatar.js';
import { IntroPreview } from '../intro_preview.js';
import { deriveRep, buildTrackerConfig } from '../solver.js';
import { PoseTester } from '../posetest.js';

let player = null;
let introPlayer = null;
let introPreview = null;

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
  view.append(header('Trainer JSON Studio', 'Preview and edit the exact JSON consumed by the CM5 trainer. The page does not generate poses or rewrite tracking rules.'));
  const slot = el('div', {}, spinner('Loading exercises…'));
  view.append(slot);

  let exercises;
  try { exercises = await api.exercises(); }
  catch (e) { slot.replaceChildren(errorBox(e)); return; }

  const liveStage = el('div', { class: 'rounded-xl border border-line bg-ink overflow-hidden min-w-0 relative', style: 'height:420px' });
  const introStage = el('div', { class: 'rounded-xl border border-line bg-ink overflow-hidden min-w-0 relative', style: 'height:360px' });
  const liveWrap = el('div', { class: 'space-y-2' },
    el('div', { class: 'text-xs font-bold text-accent uppercase tracking-wide' }, 'Trainer Test'), liveStage);
  const introWrap = el('div', { class: 'space-y-2' },
    el('div', { class: 'text-xs font-bold text-accent uppercase tracking-wide' }, 'Exercise Preview'), introStage);
  const previewModeButtons = el('div', { class: 'flex gap-2' });
  const showMode = (mode) => {
    liveWrap.hidden = mode !== 'trainer';
    introWrap.hidden = mode !== 'preview';
    previewModeButtons.querySelectorAll('button').forEach(
      (button) => button.classList.toggle('border-accent', button.dataset.mode === mode));
  };
  previewModeButtons.append(
    el('button', { 'data-mode': 'trainer', class: 'text-sm border border-accent rounded-lg px-3 py-2', onclick: () => showMode('trainer') }, 'Trainer Test'),
    el('button', { 'data-mode': 'preview', class: 'text-sm border border-line rounded-lg px-3 py-2', onclick: () => showMode('preview') }, 'Exercise Preview'),
  );
  const previewColumn = el('div', { class: 'space-y-5 min-w-0' },
    previewModeButtons, liveWrap, introWrap);
  showMode('trainer');
  const panel = el('div', { class: 'min-w-0' });
  const select = el('select', { class: 'bg-ink border border-line rounded-lg px-3 py-2 text-sm focus:border-accent outline-none' },
    el('option', { value: '' }, '— pick an exercise —'),
    ...exercises.filter((e) => e.trainer_config).map((e) => el('option', { value: e.slug }, e.display_name || e.slug)));

  slot.replaceChildren(
    el('div', { class: 'flex items-center gap-3 mb-4' }, select),
    el('div', { class: 'grid xl:grid-cols-[minmax(0,1.5fr)_minmax(360px,1fr)] gap-6 items-start' }, previewColumn, panel),
  );

  player = new AvatarPlayer(liveStage);
  introPlayer = new AvatarPlayer(introStage);

  select.addEventListener('change', () => { if (select.value) previewMode(panel, select.value, exercises, liveStage, introStage, introWrap); });

  // start by previewing the first real exercise, if any
  const first = exercises.find((e) => e.slug === 'squat' && e.trainer_config)
    || exercises.find((e) => e.trainer_config);
  if (first) { select.value = first.slug; previewMode(panel, first.slug, exercises, liveStage, introStage, introWrap); }
  else panel.replaceChildren(errorBox('No trainer JSON is registered yet.'));
}

const cloneJson = (value) => JSON.parse(JSON.stringify(value));
const trainerAnimationOf = (raw) => raw?.shadow_coach?.trainer_animation || raw?.trainer_animation || {};
const trainerRawFromAnimation = (slug, animation) => ({
  trainer_schema_version: Number(animation?.schema_version || 1),
  trainer_config_id: `${slug}_ik`,
  shadow_coach: { enabled: true, shadow_render_style: 'procedural_3d', trainer_animation: animation },
});
const HYBRID_TEMPLATE = {
  mode: 'biomech_fk_ik',
  body_profile: { femur_length: 0.435, tibia_length: 0.44, torso_length: 0.35 },
  contacts: { ground_y: 0.03, ankle_height: 0.08, stance_width: 0.24 },
  motion: { keyframes: { stand: { thigh_pitch_deg: 0 }, bottom: { thigh_pitch_deg: 73, shank_pitch_deg: -25, torso_pitch_deg: 32 } } },
};
function hybridInfoCard() {
  return card(
    el('div', { class: 'text-sm font-bold text-accent mb-2' }, 'CM5 hybrid FK + contact-IK JSON'),
    el('div', { class: 'text-xs text-neutral-400 leading-relaxed' }, 'CM5 keeps bone lengths fixed, solves the pelvis from planted feet, then builds torso and arms with forward kinematics. The browser renders the same generic JSON; it has no Squat-specific pose code. Tracker thresholds remain a separate JSON.'),
    el('details', { class: 'mt-3 text-xs text-neutral-400' },
      el('summary', { class: 'cursor-pointer text-neutral-200' }, 'v2 template shape'),
      el('pre', { class: 'mt-2 overflow-auto rounded bg-black p-3 text-[11px] text-accent' }, JSON.stringify(HYBRID_TEMPLATE, null, 2))),
  );
}
async function loadJsonSources(slug) {
  let raw = null;
  try { raw = (await api.trainerRawConfig(slug)).config; }
  catch {
    const legacy = await api.trainerConfig(slug);
    raw = trainerRawFromAnimation(slug, legacy.trainer_animation);
  }
  let trainerSource = 'backend';
  let intro = null;
  let introSource = 'backend';
  try { intro = (await api.previewConfig(slug)).config; }
  catch {
    introSource = 'not configured';
  }
  return { raw, intro, trainerSource, introSource };
}

// ── PREVIEW: independent trainer + intro players; webcam uses tracker only ──
async function previewMode(panel, slug, exercises, liveStage, introStage, introWrap) {
  introPreview?.dispose();
  introPreview = null;
  player.endEdit();
  panel.replaceChildren(spinner('Loading config…'));
  let sources;
  try { sources = await loadJsonSources(slug); }
  catch (e) { panel.replaceChildren(errorBox(e)); return; }
  const { raw, intro, trainerSource, introSource } = sources;
  const animation = trainerAnimationOf(raw);
  player.setConfig(animation);

  const depth = el('input', { type: 'range', min: '0', max: '100', value: '0', class: 'flex-1 accent-accent' });
  const speed = el('select', { class: 'bg-ink border border-line rounded-lg px-2 py-1 text-xs' },
    ...[['0.5', '0.5×'], ['1', '1×'], ['1.5', '1.5×'], ['2', '2×']].map(
      ([value, label]) => el('option', { value }, label)));
  speed.value = '1';
  const viewSelect = el('select', { class: 'bg-ink border border-line rounded-lg px-2 py-1 text-xs' },
    ...['side', 'front', 'angled'].map((value) => el('option', { value }, `${value} view`)));
  viewSelect.value = animation.view || 'side';
  viewSelect.onchange = () => player.setView(viewSelect.value);
  const markerToggle = el('input', { type: 'checkbox', checked: true, class: 'accent-accent' });
  markerToggle.onchange = () => player.setJointMarkers(markerToggle.checked);
  const coordinates = el('pre', { class: 'max-h-44 overflow-auto rounded bg-black p-2 text-[10px] text-neutral-400 mt-2' });
  const phaseLabel = el('div', { class: 'text-xs text-accent font-semibold' });
  const guidanceText = el('div', { class: 'text-xs text-neutral-300 mt-2' });
  const guidanceVoice = el('button', { class: 'text-xs border border-line rounded px-2 py-1 mt-2' }, 'Play trainer voice');
  let currentGuidanceVoice = '';
  guidanceVoice.onclick = () => {
    if (currentGuidanceVoice) new Audio(`${API_BASE}/media/exercises/${slug}/${currentGuidanceVoice}`).play().catch(() => {});
  };
  const phaseBar = el('div', { class: 'flex flex-wrap gap-1.5 mt-2' });
  const phases = animation.phases || [];
  const variants = animation.variants || [];
  const variantSelect = variants.length ? el('select', {
    class: 'bg-ink border border-line rounded-lg px-2 py-1 text-xs',
    title: 'Left/right exercise variant',
  }, ...variants.map((value) => el('option', { value }, value.replaceAll('_', ' ')))) : null;
  const phaseMatchesVariant = (phase, variant) => !phase.variant || phase.variant === variant;
  const updateVisiblePhases = () => {
    phaseBar.querySelectorAll('button').forEach((button) => {
      const phase = phases.find((item) => item.name === button.dataset.phase);
      button.hidden = Boolean(variantSelect && !phaseMatchesVariant(phase || {}, variantSelect.value));
    });
  };
  const setPhase = (name) => {
    player.setPhase(name, 0);
    phaseLabel.textContent = `Current phase: ${name}`;
    const guidance = raw?.shadow_coach?.guidance?.[name] || {};
    guidanceText.textContent = guidance.text || 'No guidance text configured for this phase.';
    currentGuidanceVoice = guidance.voice || '';
    guidanceVoice.disabled = !currentGuidanceVoice;
    phaseBar.querySelectorAll('button').forEach(
      (button) => button.classList.toggle('border-accent', button.dataset.phase === name));
  };
  for (const phase of phases) {
    phaseBar.append(el('button', {
      'data-phase': phase.name,
      class: 'text-xs border border-line rounded px-2 py-1',
      onclick: () => setPhase(phase.name),
    }, phase.name));
  }
  if (variantSelect) {
    variantSelect.onchange = () => {
      updateVisiblePhases();
      const next = phases.find((item) => item.from !== item.to && phaseMatchesVariant(item, variantSelect.value))
        || phases.find((item) => phaseMatchesVariant(item, variantSelect.value));
      if (next) setPhase(next.name);
    };
    updateVisiblePhases();
  }
  const firstPhase = phases.find((item) => item.from !== item.to && phaseMatchesVariant(item, variantSelect?.value))
    ?.name || phases[0]?.name || 'stand';
  setPhase(firstPhase);
  const playBtn = el('button', { class: 'inline-flex items-center gap-1.5 bg-accent text-ink font-semibold text-sm px-4 py-2 rounded-lg' });
  const setPlay = (p) => playBtn.replaceChildren(icon(p ? 'pause' : 'play', 'w-4 h-4'), p ? 'Pause' : 'Play');
  setPlay(false);
  const editBtn = el('button', { class: 'inline-flex items-center gap-1.5 text-sm border border-line rounded-lg px-3 py-2 hover:border-accent' }, icon('edit', 'w-4 h-4'), 'Edit JSON');
  const testBtn = el('button', { class: 'inline-flex items-center gap-1.5 text-sm border border-line rounded-lg px-3 py-2 hover:border-accent' }, icon('person', 'w-4 h-4'), 'Test with webcam');

  playBtn.onclick = () => {
    if (player.playing) { player.pause(); setPlay(false); }
    else { player.play(2.4 / Number(speed.value || 1)); setPlay(true); }
  };
  player.onDepth = (d) => {
    depth.value = Math.round(d * 100);
    coordinates.textContent = JSON.stringify(player.coordinates(), null, 1);
  };
  depth.oninput = () => { player.pause(); setPlay(false); player.setDepth(depth.value / 100); };
  editBtn.onclick = () => jsonMode(panel, { slug, raw, intro, trainerSource, introSource }, exercises, liveStage, introStage, introWrap);
  testBtn.onclick = () => startWebcamTest(liveStage, slug, testBtn);

  const introCard = intro ? makeIntroPreviewCard(intro, introStage, slug) : null;
  const keyframes = animation.motion?.keyframes || animation.keyframes || {};
  const contacts = Array.isArray(animation.contacts) ? animation.contacts : [];
  const unsupported = contacts.filter((contact) => !contact.anchor && contact.mode !== 'supported');

  panel.replaceChildren(
    hybridInfoCard(),
    card(
      el('div', { class: 'flex items-center gap-2 mb-3 flex-wrap' }, pill(`${slug}_ik.json`), pill(animation.mode || 'unknown', 'accent'), pill(trainerSource)),
      el('div', { class: 'flex items-center gap-3' }, playBtn,
        el('div', { class: 'flex items-center gap-2 flex-1' }, el('span', { class: 'text-xs text-neutral-500' }, 'depth'), depth)),
      el('div', { class: 'flex flex-wrap items-center gap-3 mt-3 text-xs text-neutral-400' },
        speed, viewSelect, ...(variantSelect ? [variantSelect] : []),
        el('label', { class: 'flex items-center gap-1' }, markerToggle, 'joint markers')),
      phaseLabel,
      guidanceText,
      guidanceVoice,
      phaseBar,
      el('div', { class: 'flex gap-2 mt-3' }, editBtn, testBtn),
      el('details', { class: 'mt-3 text-xs text-neutral-500' },
        el('summary', {}, 'Current pose coordinates'), coordinates),
    ),
    card(
      el('div', { class: 'text-xs font-bold text-accent uppercase tracking-wide mb-2' }, 'Contacts and diagnostics'),
      el('div', { class: 'flex flex-wrap gap-2' },
        ...(contacts.length ? contacts.map((contact) => pill(`${contact.joint}: ${contact.mode}`)) : [pill('no explicit contacts', 'danger')])),
      unsupported.length ? el('div', { class: 'text-xs text-danger mt-2' }, `${unsupported.length} contact(s) have no enforceable anchor.`)
        : el('div', { class: 'text-xs text-neutral-500 mt-2' }, 'Declared contact anchors are solved before rendering. Bone-length parity is covered by shared fixture tests.'),
    ),
    ...(introCard ? [introCard, card(el('div', { class: 'text-xs text-neutral-500' }, `Intro source: ${introSource}`))] : []),
    card(el('div', { class: 'text-xs text-neutral-500 leading-relaxed' },
      el('span', { class: 'text-accent font-semibold' }, 'Parity: '),
      `this player uses ${Object.keys(keyframes).length} JSON keyframes and the same solver contract as CM5. The webcam test reads only the tracker JSON; it does not alter this trainer JSON.`)),
  );
}

function makeIntroPreviewCard(intro, stage, slug) {
  stage.querySelector('[data-intro-overlay]')?.remove();
  const overlay = el('div', { 'data-intro-overlay': 'true', class: 'absolute inset-x-0 bottom-0 z-10 text-center px-8 py-7 pointer-events-none',
    style: 'background:linear-gradient(transparent,rgba(13,15,12,.96))' });
  const oneLine = intro.text_style?.show_subtitle === false || Number(intro.text_style?.max_lines || 2) <= 1;
  const title = el('div', { class: oneLine ? 'text-3xl font-black text-white' : 'text-xl font-black text-white' });
  const subtitle = el('div', { class: 'text-sm text-neutral-300 mt-1' });
  if (oneLine) subtitle.hidden = true;
  overlay.append(title, subtitle);
  stage.append(overlay);
  const status = el('div', { class: 'text-xs text-neutral-500 mt-2' });
  const scrubber = el('input', { type: 'range', min: '0', max: '1000', value: '0', class: 'w-full accent-accent mt-3' });
  const speed = el('select', { class: 'bg-ink border border-line rounded-lg px-2 py-1 text-xs' },
    ...[['0.5', '0.5×'], ['1', '1×'], ['1.5', '1.5×'], ['2', '2×']].map(
      ([value, label]) => el('option', { value }, label)));
  speed.value = '1';
  const viewSelect = el('select', { class: 'bg-ink border border-line rounded-lg px-2 py-1 text-xs' },
    ...['side', 'front', 'angled'].map((value) => el('option', { value }, `${value} view`)));
  viewSelect.value = intro.view || intro.presentation?.view || 'side';
  const markerToggle = el('input', { type: 'checkbox', checked: true, class: 'accent-accent' });
  const coordinates = el('pre', { class: 'max-h-36 overflow-auto rounded bg-black p-2 text-[10px] text-neutral-400 mt-2' });
  const stepBar = el('div', { class: 'flex flex-wrap gap-2 mt-3' });
  const variants = intro.variants || [];
  const variantSelect = variants.length ? el('select', {
    class: 'bg-ink border border-line rounded-lg px-2 py-1 text-xs',
    title: 'Left/right exercise variant',
  }, ...variants.map((value) => el('option', { value }, value.replaceAll('_', ' ')))) : null;
  const voice = el('button', { class: 'text-sm border border-line rounded-lg px-3 py-2' }, 'Play preview voice');
  let currentVoice = '';
  voice.onclick = () => {
    if (currentVoice) new Audio(`${API_BASE}/media/exercises/${slug}/${currentVoice}`).play().catch(() => {});
  };
  const preview = new IntroPreview(introPlayer, ({ step, phase, fade, elapsed, total, view }) => {
    title.textContent = step.title || '';
    subtitle.textContent = oneLine ? '' : (step.subtitle || '');
    overlay.style.opacity = String(fade);
    status.textContent = `${phase} · ${elapsed.toFixed(1)} / ${total.toFixed(1)} s · ${view} view`;
    scrubber.value = total > 0 ? String(Math.round((elapsed / total) * 1000)) : '0';
    coordinates.textContent = JSON.stringify(introPlayer.coordinates(), null, 1);
    currentVoice = step.voice || step.audio_cue || '';
    voice.disabled = !currentVoice;
    stepBar.querySelectorAll('button').forEach((button, index) => button.classList.toggle('border-accent', index === (intro.timeline || []).indexOf(step)));
  });
  introPreview = preview;
  scrubber.oninput = () => { preview.seek(Number(scrubber.value) / 1000); setPlay(false); };
  speed.onchange = () => preview.setPlaybackRate(speed.value);
  viewSelect.onchange = () => preview.setView(viewSelect.value);
  markerToggle.onchange = () => introPlayer.setJointMarkers(markerToggle.checked);

  const play = el('button', { class: 'inline-flex items-center gap-1.5 bg-accent text-ink font-semibold text-sm px-3 py-2 rounded-lg' });
  const setPlay = (playing) => play.replaceChildren(icon(playing ? 'pause' : 'play', 'w-4 h-4'), playing ? 'Pause intro' : 'Play intro');
  setPlay(false);
  play.onclick = () => { if (preview.playing) { preview.pause(); setPlay(false); } else { preview.play(); setPlay(true); } };
  const replay = el('button', { class: 'text-sm border border-line rounded-lg px-3 py-2 hover:border-accent' }, 'Replay');
  replay.onclick = () => { preview.replay(); setPlay(true); };
  (intro.timeline || []).forEach((step, index) => stepBar.append(el('button', {
    'data-variant': step.variant || '',
    class: 'text-xs border border-line rounded-md px-2 py-1 text-neutral-300 hover:border-accent',
    onclick: () => {
      preview.pause();
      setPlay(false);
      preview.showStep(preview.timeline().indexOf(step));
    },
  }, `${index + 1}. ${step.title}`)));
  preview.setConfig(intro);
  preview.setPlaybackRate(speed.value);
  preview.setView(viewSelect.value);
  if (variantSelect) {
    const updateVariant = () => {
      preview.setVariant(variantSelect.value);
      setPlay(false);
      stepBar.querySelectorAll('button').forEach((button) => {
        button.hidden = Boolean(button.dataset.variant && button.dataset.variant !== variantSelect.value);
      });
    };
    variantSelect.onchange = updateVariant;
    updateVariant();
  }
  return card(
    el('div', { class: 'text-xs font-bold text-accent uppercase tracking-wide mb-2' }, 'Pre-exercise intro — separate player'),
    el('div', { class: 'flex gap-2 items-center flex-wrap' }, play, replay, voice,
      ...(variantSelect ? [variantSelect] : []), pill(`${preview.totalDuration().toFixed(1)} s`, 'accent')),
    scrubber,
    el('div', { class: 'flex flex-wrap items-center gap-3 mt-2 text-xs text-neutral-400' },
      speed, viewSelect, el('label', { class: 'flex items-center gap-1' }, markerToggle, 'joint markers')),
    status,
    stepBar,
    el('details', { class: 'mt-3 text-xs text-neutral-500' },
      el('summary', {}, 'Current preview pose coordinates'), coordinates),
  );
}

function jsonMode(panel, context, exercises, liveStage, introStage, introWrap) {
  introPreview?.dispose();
  introPreview = null;
  player.endEdit();
  const { slug, trainerSource, introSource } = context;
  let raw = cloneJson(context.raw);
  let intro = context.intro ? cloneJson(context.intro) : null;
  const status = el('div', { class: 'text-xs mt-2' });
  const say = (message, tone = 'neutral-400') => { status.className = `text-xs mt-2 text-${tone}`; status.textContent = message; };
  const codeClass = 'w-full min-h-[360px] bg-black border border-line rounded-lg p-3 text-xs font-mono leading-5 text-neutral-200 focus:border-accent outline-none';
  const trainerCode = el('textarea', { class: codeClass, spellcheck: 'false' });
  trainerCode.value = JSON.stringify(raw, null, 2);
  const introCode = el('textarea', { class: codeClass, spellcheck: 'false' });
  introCode.value = JSON.stringify(intro || {}, null, 2);
  const parse = (field, label) => {
    try { return JSON.parse(field.value); } catch (error) { throw new Error(`${label} JSON: ${error.message}`); }
  };
  const applyTrainer = () => {
    raw = parse(trainerCode, 'Trainer');
    const animation = trainerAnimationOf(raw);
    if (!animation.mode) throw new Error('Trainer JSON needs shadow_coach.trainer_animation.mode.');
    player.setConfig(animation); player.setDepth(0);
    return raw;
  };
  const applyIntro = () => {
    intro = parse(introCode, 'Intro');
    const poses = intro.schema_version === 3 ? intro.poses : intro.trainer_animation?.poses;
    if (!Array.isArray(intro.timeline) || !poses) throw new Error('Preview JSON needs timeline and poses.');
    introWrap.hidden = false;
    introPreview?.dispose();
    makeIntroPreviewCard(intro, introStage, slug);
    return intro;
  };
  try { applyTrainer(); if (intro) applyIntro(); } catch (error) { say(error.message, 'danger'); }
  const applyTrainerBtn = el('button', { class: 'text-sm bg-accent text-ink font-semibold rounded-lg px-3 py-2' }, 'Apply trainer preview');
  applyTrainerBtn.onclick = () => { try { applyTrainer(); say('Trainer preview updated from JSON.', 'accent'); } catch (error) { say(error.message, 'danger'); } };
  const saveTrainerBtn = el('button', { class: 'text-sm border border-accent text-accent rounded-lg px-3 py-2' }, 'Save trainer JSON');
  saveTrainerBtn.onclick = async () => {
    try {
      const config = applyTrainer();
      saveTrainerBtn.disabled = true;
      await api.saveTrainerRawConfig(slug, config);
      const fetched = (await api.trainerRawConfig(slug)).config;
      if (JSON.stringify(fetched) !== JSON.stringify(config)) {
        throw new Error('Trainer save read-back did not match the edited JSON.');
      }
      say('Trainer JSON saved and exact backend read-back verified. Tracker JSON was not changed.', 'accent');
    }
    catch (error) { say(error.message || 'Trainer save failed.', 'danger'); }
    finally { saveTrainerBtn.disabled = false; }
  };
  const applyIntroBtn = el('button', { class: 'text-sm bg-accent text-ink font-semibold rounded-lg px-3 py-2' }, 'Apply intro preview');
  applyIntroBtn.onclick = () => { try { applyIntro(); say('Intro preview updated from JSON.', 'accent'); } catch (error) { say(error.message, 'danger'); } };
  const saveIntroBtn = el('button', { class: 'text-sm border border-accent text-accent rounded-lg px-3 py-2' }, 'Save intro JSON');
  saveIntroBtn.onclick = async () => {
    try {
      const config = applyIntro();
      saveIntroBtn.disabled = true;
      await api.savePreviewConfig(slug, config);
      const fetched = (await api.previewConfig(slug)).config;
      if (JSON.stringify(fetched) !== JSON.stringify(config)) {
        throw new Error('Preview save read-back did not match the edited JSON.');
      }
      say('Preview JSON saved and exact backend read-back verified.', 'accent');
    }
    catch (error) { say(error.message || 'Intro save failed.', 'danger'); }
    finally { saveIntroBtn.disabled = false; }
  };
  const back = el('button', { class: 'text-sm border border-line text-neutral-300 rounded-lg px-3 py-2' }, 'Back to previews');
  back.onclick = () => previewMode(panel, slug, exercises, liveStage, introStage, introWrap);
  panel.replaceChildren(
    hybridInfoCard(),
    card(el('div', { class: 'flex gap-2 flex-wrap' }, back, pill(`trainer: ${trainerSource}`), pill(`intro: ${introSource}`))),
    card(el('div', { class: 'text-xs font-bold text-accent uppercase tracking-wide mb-2' }, 'Live trainer JSON — backend'), trainerCode,
      el('div', { class: 'flex gap-2 mt-3' }, applyTrainerBtn, saveTrainerBtn)),
    card(el('div', { class: 'text-xs font-bold text-accent uppercase tracking-wide mb-2' }, 'Pre-exercise intro JSON — backend'), introCode,
      el('div', { class: 'flex gap-2 mt-3' }, applyIntroBtn, saveIntroBtn), status),
  );
}

// Overlay the webcam tester on top of the avatar stage; counts reps against the
// exercise's saved tracker config (same thresholds the CM5 uses).
async function startWebcamTest(stage, slug, testBtn) {
  player.pause();
  const host = stage; // stage is position:relative — overlay covers just the stage
  testBtn.disabled = true;
  const overlay = el('div', { class: 'absolute inset-0 bg-ink z-10' });
  const stopBtn = el('button', { class: 'absolute bottom-3 right-3 z-20 inline-flex items-center gap-1.5 bg-danger text-white font-semibold text-sm px-3 py-2 rounded-lg' }, 'Stop test');
  host.append(overlay, stopBtn);
  let tracker;
  try {
    tracker = await api.trackerConfig(slug);
  } catch (error) {
    overlay.replaceChildren(errorBox(
      `Tracking test unavailable: ${error.message || 'backend tracker JSON could not be loaded.'}`,
    ));
    stopBtn.onclick = () => {
      overlay.remove();
      stopBtn.remove();
      testBtn.disabled = false;
    };
    return;
  }
  const tester = new PoseTester(overlay);
  stopBtn.onclick = () => { tester.stop(); overlay.remove(); stopBtn.remove(); testBtn.disabled = false; };
  tester.start(tracker);
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
      if (i) tabBar.append(el('span', { class: 'text-neutral-600' }, '→'));
      tabBar.append(el('button', {
        class: `px-3 py-1.5 rounded-lg text-sm font-medium border ${label === current ? 'border-accent text-accent bg-accent/10' : 'border-line text-neutral-400'}`,
        onclick: () => selectStep(label),
      }, label));
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
        el('span', { class: 'text-xs text-neutral-500' }, 'click a joint → drag arrows to move · drag empty space to orbit')),
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
