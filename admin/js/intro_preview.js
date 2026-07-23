// Generic JSON intro timeline for the Trainer Designer.  It knows nothing
// about exercise names or coaching copy: steps reference poses and durations.
import { lerpTargets } from './solver.js';

const EASING = {
  linear: (t) => t,
  smoothstep: (t) => t * t * (3 - 2 * t),
  ease_in_out_cubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2),
  ease_out_cubic: (t) => 1 - ((1 - t) ** 3),
};

export class IntroPreview {
  constructor(player, onFrame = () => {}) {
    this.player = player;
    this.onFrame = onFrame;
    this.config = null;
    this.playing = false;
    this.elapsed = 0;
    this._last = 0;
    this._raf = null;
  }

  setConfig(config) {
    this.pause();
    this.config = config;
    this.elapsed = 0;
    this.render();
  }

  totalDuration() {
    if (!this.config) return 0;
    const opening = Number(this.config.presentation?.fade_in_s || 0);
    const steps = (this.config.timeline || []).reduce((sum, step) => sum
      + Number(step.instruction_hold_s || 0)
      + Number(step.transition_s || 0)
      + Number(step.result_hold_s || 0), 0);
    const handoff = this.config.handoff || {};
    return opening + steps + Number(handoff.rotation_s || handoff.crossfade_s || 0);
  }

  play() {
    if (!this.config || this.playing) return;
    if (this.elapsed >= this.totalDuration()) this.elapsed = 0;
    this.playing = true;
    this._last = performance.now();
    const tick = (now) => {
      if (!this.playing) return;
      this.elapsed = Math.min(this.totalDuration(), this.elapsed + (now - this._last) / 1000);
      this._last = now;
      this.render();
      if (this.elapsed >= this.totalDuration()) { this.pause(); return; }
      this._raf = requestAnimationFrame(tick);
    };
    this._raf = requestAnimationFrame(tick);
  }

  pause() { this.playing = false; if (this._raf) cancelAnimationFrame(this._raf); this._raf = null; }
  replay() { this.pause(); this.elapsed = 0; this.render(); this.play(); }

  showStep(index) {
    if (!this.config) return;
    const opening = Number(this.config.presentation?.fade_in_s || 0);
    const prior = (this.config.timeline || []).slice(0, index).reduce((sum, step) => sum
      + Number(step.instruction_hold_s || 0) + Number(step.transition_s || 0) + Number(step.result_hold_s || 0), 0);
    this.elapsed = opening + prior;
    this.render();
  }

  render() {
    const cfg = this.config;
    if (!cfg) return;
    const opening = Number(cfg.presentation?.fade_in_s || 0);
    const poses = cfg.trainer_animation?.poses || {};
    const timeline = cfg.timeline || [];
    let cursor = opening;
    let active = timeline[timeline.length - 1] || null;
    let phase = 'handoff';
    let progress = 1;
    for (let index = 0; index < timeline.length; index += 1) {
      const step = timeline[index];
      const instruction = Number(step.instruction_hold_s || 0);
      const transition = Number(step.transition_s || 0);
      const result = Number(step.result_hold_s || 0);
      const end = cursor + instruction + transition + result;
      if (this.elapsed <= end) {
        active = step;
        if (this.elapsed < cursor + instruction) { phase = 'instruction'; progress = 0; }
        else if (transition > 0 && this.elapsed < cursor + instruction + transition) {
          phase = 'transition';
          const raw = (this.elapsed - cursor - instruction) / transition;
          progress = (EASING[step.easing] || EASING.linear)(Math.max(0, Math.min(1, raw)));
        } else { phase = 'result'; progress = 1; }
        break;
      }
      cursor = end;
    }
    if (!active) return;
    const from = poses[active.from_pose]?.targets || {};
    const to = poses[active.to_pose]?.targets || from;
    this.player.setIntroPose(lerpTargets(from, to, progress), cfg.trainer_animation, cfg.presentation?.view || 'front');
    const fade = opening > 0 ? Math.min(1, this.elapsed / opening) : 1;
    this.onFrame({ step: active, phase, progress, fade, elapsed: this.elapsed, total: this.totalDuration(), view: cfg.presentation?.view || 'front' });
  }

  dispose() { this.pause(); }
}
