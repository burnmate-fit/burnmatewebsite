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
    this.variant = null;
    this._last = 0;
    this._raf = null;
    this.playbackRate = 1;
    this.view = null;
  }

  setConfig(config) {
    this.pause();
    this.config = config;
    this.variant = config?.variants?.[0] || null;
    this.elapsed = 0;
    if (config?.schema_version === 3) this.player.setPreviewConfig(config);
    this.render();
  }

  timeline() {
    const timeline = this.config?.timeline || [];
    if (!this.variant) return timeline;
    return timeline.filter((step) => !step.variant || step.variant === this.variant);
  }

  setVariant(variant) {
    this.pause();
    this.variant = variant || null;
    this.elapsed = 0;
    this.render();
  }

  setPlaybackRate(rate) {
    this.playbackRate = Math.max(0.25, Math.min(4, Number(rate) || 1));
  }

  setView(view) {
    this.view = view || null;
    this.render();
  }

  seek(fraction) {
    this.pause();
    this.elapsed = this.totalDuration() * Math.max(0, Math.min(1, Number(fraction) || 0));
    this.render();
  }

  totalDuration() {
    if (!this.config) return 0;
    if (this.config.schema_version === 3) {
      return this.timeline().reduce(
        (sum, step) => sum + Number(step.duration_seconds || 0), 0);
    }
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
      this.elapsed = Math.min(
        this.totalDuration(),
        this.elapsed + ((now - this._last) / 1000) * this.playbackRate,
      );
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
    if (this.config.schema_version === 3) {
      this.elapsed = this.timeline().slice(0, index).reduce(
        (sum, step) => sum + Number(step.duration_seconds || 0), 0);
      this.render();
      return;
    }
    const opening = Number(this.config.presentation?.fade_in_s || 0);
    const prior = (this.config.timeline || []).slice(0, index).reduce((sum, step) => sum
      + Number(step.instruction_hold_s || 0) + Number(step.transition_s || 0) + Number(step.result_hold_s || 0), 0);
    this.elapsed = opening + prior;
    this.render();
  }

  render() {
    const cfg = this.config;
    if (!cfg) return;
    if (cfg.schema_version === 3) {
      this._renderV3(cfg);
      return;
    }
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
    if (this.view) this.player.setView(this.view);
    const fade = opening > 0 ? Math.min(1, this.elapsed / opening) : 1;
    this.onFrame({ step: active, phase, progress, fade, elapsed: this.elapsed, total: this.totalDuration(), view: cfg.presentation?.view || 'front' });
  }

  _renderV3(cfg) {
    const timeline = this.timeline();
    const poses = cfg.poses || {};
    let cursor = 0;
    let active = timeline[timeline.length - 1] || null;
    let progress = 1;
    for (const step of timeline) {
      const duration = Math.max(0.001, Number(step.duration_seconds || 0));
      if (this.elapsed <= cursor + duration) {
        active = step;
        const raw = Math.max(0, Math.min(1, (this.elapsed - cursor) / duration));
        progress = (EASING[step.easing] || EASING.smoothstep)(raw);
        break;
      }
      cursor += duration;
    }
    if (!active) return;
    const from = poses[active.from_pose]?.targets || poses[active.from_pose] || {};
    const to = poses[active.to_pose]?.targets || poses[active.to_pose] || from;
    this.player.setPoseTransition(from, to, progress, cfg);
    if (this.view) this.player.setView(this.view);
    this.onFrame({
      step: active,
      phase: progress <= 0 ? 'instruction' : progress >= 1 ? 'result' : 'transition',
      progress,
      fade: 1,
      elapsed: this.elapsed,
      total: this.totalDuration(),
      view: this.view || cfg.view || 'side',
    });
  }

  dispose() { this.pause(); }
}
