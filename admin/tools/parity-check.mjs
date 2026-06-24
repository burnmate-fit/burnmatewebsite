// Parity check: the browser avatar solver (solver.js) must reproduce the CM5
// device solver within epsilon. Generate the golden file on the CM5 side first:
//
//   cd burnmate_cm5 && python tools/export_golden_frames.py > /tmp/golden.json
//
// then run:
//
//   node tools/parity-check.mjs /tmp/golden.json
//
// Config files are read from the backend's trainer_configs dir (adjust if moved).
import { poseAtDepth } from '../js/solver.js';
import { readFileSync } from 'node:fs';

const goldenPath = process.argv[2] || '/tmp/golden.json';
const CONFIG_DIR = process.argv[3] ||
  '../../burnmate_backend/app/data/trainer_configs';

const golden = JSON.parse(readFileSync(goldenPath, 'utf8'));
const FILES = { squat: 'squat_ik', pushup: 'pushup_ik', reverse_lunge: 'reverse_lunge_ik', wide_pushup: 'wide_pushup_ik' };

let worst = 0;
for (const slug of Object.keys(golden)) {
  const file = FILES[slug] || `${slug}_ik`;
  const anim = JSON.parse(readFileSync(`${CONFIG_DIR}/${file}.json`, 'utf8')).shadow_coach.trainer_animation;
  let m = 0;
  for (const [d, frame] of Object.entries(golden[slug])) {
    const js = poseAtDepth(anim, parseFloat(d));
    for (const [j, gp] of Object.entries(frame)) {
      const p = js[j]; if (!p) continue;
      for (let i = 0; i < 3; i++) m = Math.max(m, Math.abs(p[i] - gp[i]));
    }
  }
  console.log(`${slug.padEnd(14)} max err ${m.toExponential(2)} ${m < 1e-5 ? 'OK' : 'DRIFT'}`);
  worst = Math.max(worst, m);
}
console.log(worst < 1e-5 ? 'PARITY OK' : 'PARITY FAILED');
process.exit(worst < 1e-5 ? 0 : 1);
