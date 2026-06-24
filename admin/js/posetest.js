// Webcam live-test — runs MediaPipe BlazePose in the browser and counts reps
// against an exercise's tracker config (the same joints + thresholds the CM5
// board uses). Lets you do the rep and watch it count before deploying.
import { PoseLandmarker, FilesetResolver } from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.12';

const CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.12';
const MODEL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

// MediaPipe/BlazePose landmark name → index (the names our tracker config uses)
const MP_INDEX = {
  NOSE: 0, LEFT_SHOULDER: 11, RIGHT_SHOULDER: 12, LEFT_ELBOW: 13, RIGHT_ELBOW: 14,
  LEFT_WRIST: 15, RIGHT_WRIST: 16, LEFT_HIP: 23, RIGHT_HIP: 24,
  LEFT_KNEE: 25, RIGHT_KNEE: 26, LEFT_ANKLE: 27, RIGHT_ANKLE: 28,
};
// pairs to draw the skeleton
const BONES = [[11,13],[13,15],[12,14],[14,16],[11,12],[23,24],[11,23],[12,24],[23,25],[25,27],[24,26],[26,28]];

function angle2d(a, b, c) {
  const ba = [a.x - b.x, a.y - b.y], bc = [c.x - b.x, c.y - b.y];
  const m = Math.hypot(...ba) * Math.hypot(...bc);
  if (m < 1e-9) return 180;
  return Math.acos(Math.max(-1, Math.min(1, (ba[0]*bc[0] + ba[1]*bc[1]) / m))) * 180 / Math.PI;
}
const vis = (lm, tri) => (lm[tri[0]].visibility + lm[tri[1]].visibility + lm[tri[2]].visibility) / 3;

export class PoseTester {
  constructor(container) {
    this.container = container; this.running = false; this.reps = 0; this.state = 'up';
  }

  _ui() {
    this.video = document.createElement('video');
    this.video.autoplay = true; this.video.playsInline = true; this.video.muted = true;
    this.video.style.display = 'none';
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'w-full h-full object-contain';
    this.ctx = this.canvas.getContext('2d');
    this.readout = document.createElement('div');
    this.readout.className = 'absolute top-3 left-3 right-3 flex items-center gap-3 text-sm';
    const wrap = document.createElement('div');
    wrap.className = 'relative w-full h-full';
    wrap.append(this.canvas, this.readout, this.video);
    this.container.replaceChildren(wrap);
  }

  _say(html) { this.readout.innerHTML = html; }

  async start(tracker) {
    this.tracker = tracker || {};
    this.down = this.tracker.thresholds?.down_angle ?? 90;
    this.up = this.tracker.thresholds?.up_angle ?? 160;
    this.triL = (this.tracker.joints?.left || ['LEFT_HIP','LEFT_KNEE','LEFT_ANKLE']).map((n) => MP_INDEX[n]);
    this.triR = (this.tracker.joints?.right || ['RIGHT_HIP','RIGHT_KNEE','RIGHT_ANKLE']).map((n) => MP_INDEX[n]);
    this._ui();
    this._say('<span class="text-neutral-400">loading model…</span>');
    try {
      const vision = await FilesetResolver.forVisionTasks(`${CDN}/wasm`);
      this.landmarker = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: MODEL, delegate: 'GPU' },
        runningMode: 'VIDEO', numPoses: 1,
      });
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: false });
      this.video.srcObject = stream; this.stream = stream;
      await this.video.play();
      this.running = true; this.reps = 0; this.state = 'up';
      this._loop();
    } catch (e) {
      this._say(`<span class="text-danger">${e.message || e}. Allow camera access?</span>`);
    }
  }

  _loop() {
    if (!this.running) return;
    const v = this.video;
    if (v.readyState >= 2) {
      this.canvas.width = v.videoWidth; this.canvas.height = v.videoHeight;
      this.ctx.save(); this.ctx.scale(-1, 1); this.ctx.translate(-this.canvas.width, 0); // mirror
      this.ctx.drawImage(v, 0, 0, this.canvas.width, this.canvas.height);
      this.ctx.restore();
      const res = this.landmarker.detectForVideo(v, performance.now());
      if (res.landmarks && res.landmarks[0]) this._process(res.landmarks[0]);
    }
    requestAnimationFrame(() => this._loop());
  }

  _process(lm) {
    const W = this.canvas.width, H = this.canvas.height;
    const X = (p) => (1 - p.x) * W, Y = (p) => p.y * H; // mirror x to match the flipped video
    // skeleton
    this.ctx.strokeStyle = 'rgba(132,204,22,0.7)'; this.ctx.lineWidth = 3;
    for (const [a, b] of BONES) { this.ctx.beginPath(); this.ctx.moveTo(X(lm[a]), Y(lm[a])); this.ctx.lineTo(X(lm[b]), Y(lm[b])); this.ctx.stroke(); }
    this.ctx.fillStyle = '#84CC16';
    for (const i of [11,12,13,14,15,16,23,24,25,26,27,28]) { this.ctx.beginPath(); this.ctx.arc(X(lm[i]), Y(lm[i]), 5, 0, 7); this.ctx.fill(); }

    // driver angle — use the more visible side
    const tri = vis(lm, this.triL) >= vis(lm, this.triR) ? this.triL : this.triR;
    const ang = angle2d(lm[tri[0]], lm[tri[1]], lm[tri[2]]);
    // highlight the driver joint
    this.ctx.fillStyle = '#FF4757';
    this.ctx.beginPath(); this.ctx.arc(X(lm[tri[1]]), Y(lm[tri[1]]), 8, 0, 7); this.ctx.fill();

    // rep state machine (cross below down → above up = 1 rep)
    if (this.state === 'up' && ang <= this.down) this.state = 'down';
    else if (this.state === 'down' && ang >= this.up) { this.reps++; this.state = 'up'; }

    this._say(`
      <span class="px-2 py-1 rounded-lg bg-black/60 text-accent font-bold">reps ${this.reps}</span>
      <span class="px-2 py-1 rounded-lg bg-black/60">${Math.round(ang)}°</span>
      <span class="px-2 py-1 rounded-lg bg-black/60 ${this.state === 'down' ? 'text-accent' : 'text-neutral-400'}">${this.state}</span>
      <span class="ml-auto px-2 py-1 rounded-lg bg-black/60 text-neutral-500 text-xs">down ${this.down}° · up ${this.up}°</span>`);
  }

  stop() {
    this.running = false;
    if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
    if (this.landmarker) { try { this.landmarker.close(); } catch {} }
  }
}
