// Renderer parity: the admin preview (js/solver.js) must reproduce the CM5
// device solver (burnmate_cm5/.../avatar3d/rig.py) for the SAME config.
//
// The two are hand-ported copies of one another, so nothing stops them drifting
// — and when they drift the admin shows a pose the board will never render,
// which is exactly the "it doesn't look the same" symptom.
//
// Golden frames come from the device solver, and carry the config they were
// produced from, so both sides provably compare the same JSON (no stale copies):
//
//   cd burnmate_cm5 && python tools/export_golden_frames.py > /tmp/golden.json
//   node tools/parity-check.mjs /tmp/golden.json
import { poseForPhase } from '../js/solver.js';
import { readFileSync } from 'node:fs';

const goldenPath = process.argv[2] || '/tmp/golden.json';
const EPS = Number(process.env.PARITY_EPS || 1e-4);

const golden = JSON.parse(readFileSync(goldenPath, 'utf8'));
let worst = 0, compared = 0, missing = 0;
const rows = [];

for (const [slug, entry] of Object.entries(golden)) {
  const anim = entry.config;
  let slugWorst = 0, slugPts = 0, slugMissing = 0;
  for (const [key, frame] of Object.entries(entry.frames)) {
    const at = key.lastIndexOf('@');
    const phase = key.slice(0, at);
    const progress = parseFloat(key.slice(at + 1));
    let js;
    try {
      js = poseForPhase(anim, phase, progress);
    } catch (e) {
      rows.push(`${slug.padEnd(16)} ${key.padEnd(26)} JS THREW: ${e.message}`);
      continue;
    }
    for (const [joint, py] of Object.entries(frame)) {
      const p = js?.[joint];
      if (!p) { slugMissing++; continue; }
      for (let i = 0; i < 3; i++) {
        const d = Math.abs(p[i] - py[i]);
        if (d > slugWorst) slugWorst = d;
        slugPts++;
      }
    }
  }
  compared += slugPts; missing += slugMissing;
  worst = Math.max(worst, slugWorst);
  const verdict = slugMissing ? `DRIFT (${slugMissing} joints absent in JS)`
    : (slugWorst < EPS ? 'MATCH' : 'DRIFT');
  rows.push(`${slug.padEnd(16)} max err ${slugWorst.toExponential(2)}  ${verdict}  (${slugPts} coords)`);
}

console.log(rows.join('\n'));
console.log(`\ncompared ${compared} coordinates | joints missing from the JS pose: ${missing}`);
const ok = worst < EPS && missing === 0;
console.log(ok ? `PARITY OK (worst ${worst.toExponential(2)} < ${EPS})`
               : `PARITY FAILED (worst ${worst.toExponential(2)}, missing ${missing})`);
process.exit(ok ? 0 : 1);
