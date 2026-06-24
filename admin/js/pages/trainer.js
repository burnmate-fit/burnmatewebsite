import { api } from '../api.js';
import { el, header, card, spinner, errorBox, pill } from '../ui.js';
import { icon } from '../icons.js';
import { AvatarPlayer } from '../avatar.js';

let player = null;

export async function renderTrainer(view) {
  view.append(header('Trainer Designer',
    'Fetch a trainer config and play the avatar — the exact same procedural-3D solver the CM5 board uses.'));
  const slot = el('div', {}, spinner('Loading exercises…'));
  view.append(slot);

  let exercises;
  try { exercises = await api.exercises(); }
  catch (e) { slot.replaceChildren(errorBox(e)); return; }

  const withTrainer = exercises.filter((e) => e.trainer_config);
  if (!withTrainer.length) { slot.replaceChildren(errorBox(new Error('No exercises have a trainer_config yet'))); return; }

  const select = el('select', { class: 'bg-ink border border-line rounded-lg px-3 py-2 text-sm focus:border-accent outline-none' },
    ...withTrainer.map((e) => el('option', { value: e.slug }, e.display_name || e.slug)));

  const stage = el('div', { class: 'rounded-xl border border-line bg-ink overflow-hidden', style: 'height:520px' });
  const depthSlider = el('input', { type: 'range', min: '0', max: '100', value: '0', class: 'flex-1 accent-accent' });
  const depthLabel = el('span', { class: 'text-xs text-neutral-500 w-20 text-right' }, 'stand');
  const playBtn = el('button', { class: 'inline-flex items-center gap-1.5 bg-accent text-ink font-semibold text-sm px-4 py-2 rounded-lg' });
  const setPlay = (playing) => playBtn.replaceChildren(icon(playing ? 'pause' : 'play', 'w-4 h-4'), playing ? 'Pause' : 'Play');
  setPlay(false);
  const viewBtn = el('button', { class: 'text-sm border border-line rounded-lg px-3 py-2 text-neutral-300' }, 'side view');
  const meta = el('div', { class: 'text-xs text-neutral-500' });
  const checkpoints = el('div', {});

  const left = card(
    el('div', { class: 'flex items-center gap-3 mb-4' }, select, meta),
    stage,
    el('div', { class: 'flex items-center gap-3 mt-4' },
      playBtn, viewBtn,
      el('div', { class: 'flex items-center gap-2 flex-1' },
        el('span', { class: 'text-xs text-neutral-500 w-12' }, 'depth'), depthSlider, depthLabel),
    ),
  );
  const right = el('div', { class: 'space-y-4' },
    card(el('h3', { class: 'font-bold mb-1' }, 'Rep checkpoints'),
      el('p', { class: 'text-[11px] text-neutral-600 mb-3' }, 'The "success points" — joint-angle targets scored each rep.'),
      checkpoints),
    card(el('div', { class: 'text-xs text-neutral-500 leading-relaxed' },
      el('span', { class: 'text-accent font-semibold' }, 'Parity: '),
      'this avatar is a direct JS port of the CM5 solver (rig + two-bone IK). Same keyframes → same pose the board shows.')),
  );

  slot.replaceChildren(el('div', { class: 'grid lg:grid-cols-[1.6fr_1fr] gap-6' }, left, right));

  player = new AvatarPlayer(stage);
  player.onDepth = (d) => {
    depthSlider.value = Math.round(d * 100);
    depthLabel.textContent = d < 0.05 ? 'stand' : d > 0.95 ? 'bottom' : `${Math.round(d * 100)}%`;
  };

  async function load(slug) {
    meta.textContent = 'loading config…'; checkpoints.replaceChildren(spinner('…'));
    try {
      const cfg = await api.trainerConfig(slug);
      player.setConfig(cfg.trainer_animation);
      meta.replaceChildren(pill(cfg.file), pill(`view: ${cfg.view}`, 'accent'),
        pill(`${Object.keys(cfg.trainer_animation.keyframes || {}).length} keyframes`));
      viewBtn.textContent = `${cfg.view} view`;
      renderCheckpoints(checkpoints, cfg.checkpoints);
    } catch (e) { meta.replaceChildren(errorBox(e)); checkpoints.replaceChildren(); }
  }

  select.addEventListener('change', () => { player.pause(); setPlay(false); load(select.value); });
  playBtn.addEventListener('click', () => {
    if (player.playing) { player.pause(); setPlay(false); }
    else { player.play(); setPlay(true); }
  });
  viewBtn.addEventListener('click', () => {
    player.view = player.view === 'side' ? 'front' : 'side'; player._applyView(); player._renderOnce();
    viewBtn.textContent = `${player.view} view`;
  });
  depthSlider.addEventListener('input', () => { player.pause(); setPlay(false); player.setDepth(depthSlider.value / 100); });

  load(withTrainer[0].slug);
}

function renderCheckpoints(host, checkpoints) {
  host.replaceChildren();
  const entries = Object.entries(checkpoints || {});
  if (!entries.length) { host.append(el('div', { class: 'text-xs text-neutral-600' }, 'none defined')); return; }
  for (const [name, cp] of entries) {
    const rules = (cp.rules || []).filter((r) => r.type === 'angle');
    host.append(el('div', { class: 'rounded-lg border border-line p-3 mb-2' },
      el('div', { class: 'flex items-center gap-2 mb-2' },
        el('span', { class: 'font-semibold text-sm capitalize' }, name),
        cp.score != null ? pill(`score ≥ ${cp.score}`, 'accent') : null,
        cp.hold_s != null ? pill(`hold ${cp.hold_s}s`) : null),
      ...rules.map((r) => el('div', { class: 'text-[11px] text-neutral-400 flex items-center gap-1.5' },
        el('span', { class: 'text-accent' }, '∠'),
        el('span', { class: 'text-neutral-500' }, (r.joints || []).map(shortJoint).join('–')),
        el('span', {}, `${r.comparison || ''} ${r.target}°`),
        el('span', { class: 'text-neutral-600' }, `±${r.tolerance}`),
      )),
    ));
  }
}
const shortJoint = (j) => String(j).replace('LEFT_', 'L.').replace('RIGHT_', 'R.').toLowerCase();
