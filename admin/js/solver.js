// Pure avatar solver — a faithful JS port of the CM5 procedural-3D math
// (burnmate_cm5/.../avatar3d/rig.py + ik.py). NO three.js here so it can be
// unit-tested in node against the Python for byte-for-byte parity, and reused
// later by the live rep-test. The renderer (avatar.js) imports from this.

// ── ik.py port (arrays [x,y,z] mirror python tuples) ────────────────────────
export const sub = (a, b) => [a[0]-b[0], a[1]-b[1], a[2]-b[2]];
export const add = (a, b) => [a[0]+b[0], a[1]+b[1], a[2]+b[2]];
export const mul = (a, s) => [a[0]*s, a[1]*s, a[2]*s];
export const dot = (a, b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
export const len = (a) => Math.sqrt(Math.max(0, dot(a, a)));
export function norm(a, fb = [0,1,0]) { const n = len(a); return n < 1e-8 ? fb : [a[0]/n, a[1]/n, a[2]/n]; }
export function lerp(a, b, t) { t = Math.max(0, Math.min(1, t)); return [a[0]*(1-t)+b[0]*t, a[1]*(1-t)+b[1]*t, a[2]*(1-t)+b[2]*t]; }
export function vec3(v, fb = [0,0,0]) { try { return [+v[0], +v[1], +v[2]]; } catch { return fb; } }

export function solveTwoBone(root, target, lenA, lenB, bendHint, allowStretch = false) {
  lenA = Math.max(1e-4, lenA); lenB = Math.max(1e-4, lenB);
  const r2t = sub(target, root); const dist = len(r2t);
  if (dist < 1e-6) { const ax = norm(bendHint); return [add(root, mul(ax, lenA)), add(root, mul(ax, lenA+lenB))]; }
  const dir = norm(r2t);
  const maxReach = lenA + lenB, minReach = Math.abs(lenA - lenB) + 1e-4;
  let solveDist = dist, tip = target;
  if (!allowStretch) { solveDist = Math.max(minReach, Math.min(dist, maxReach - 1e-4)); tip = add(root, mul(dir, solveDist)); }
  const x = (lenA*lenA + solveDist*solveDist - lenB*lenB) / (2*solveDist);
  const h = Math.sqrt(Math.max(0, lenA*lenA - x*x));
  let hint = norm(bendHint);
  hint = sub(hint, mul(dir, dot(hint, dir)));
  if (len(hint) < 1e-5) { hint = Math.abs(dir[1]) < 0.95 ? [0,1,0] : [0,0,1]; hint = sub(hint, mul(dir, dot(hint, dir))); }
  const bend = norm(hint);
  const mid = add(add(root, mul(dir, x)), mul(bend, h));
  return [mid, tip];
}

// ── rig.py port: body definition + stand pose + chains ──────────────────────
export const STAND = {
  pelvis:[0,0.95,0], chest:[0,1.30,0], neck:[0,1.45,0], head:[0,1.60,0],
  l_shoulder:[0.18,1.42,0], r_shoulder:[-0.18,1.42,0],
  l_elbow:[0.22,1.15,0.02], r_elbow:[-0.22,1.15,0.02],
  l_wrist:[0.235,0.87,0.04], r_wrist:[-0.235,0.87,0.04],
  l_hip:[0.10,0.95,0], r_hip:[-0.10,0.95,0],
  l_knee:[0.11,0.52,0.02], r_knee:[-0.11,0.52,0.02],
  l_ankle:[0.12,0.08,0], r_ankle:[-0.12,0.08,0],
  l_toe:[0.12,0.03,0.16], r_toe:[-0.12,0.03,0.16],
};
export const BONES = [
  ['pelvis','chest',0.125], ['chest','neck',0.070], ['neck','head',0.050],
  ['chest','l_shoulder',0.052], ['chest','r_shoulder',0.052],
  ['l_shoulder','l_elbow',0.052], ['l_elbow','l_wrist',0.047],
  ['r_shoulder','r_elbow',0.052], ['r_elbow','r_wrist',0.047],
  ['pelvis','l_hip',0.062], ['pelvis','r_hip',0.062],
  ['l_hip','l_knee',0.090], ['l_knee','l_ankle',0.062],
  ['r_hip','r_knee',0.090], ['r_knee','r_ankle',0.062],
];
export const JOINT_SPHERES = [
  ['l_shoulder',0.060],['r_shoulder',0.060],['l_elbow',0.048],['r_elbow',0.048],
  ['l_wrist',0.043],['r_wrist',0.043],['l_hip',0.078],['r_hip',0.078],
  ['l_knee',0.074],['r_knee',0.074],['l_ankle',0.052],['r_ankle',0.052],['neck',0.060],
];
export const ELLIPSOIDS = [['chest',[0.165,0.20,0.115]], ['pelvis',[0.150,0.135,0.110]], ['head',[0.105,0.120,0.105]]];
const CHAINS = {
  left_arm:{root:'l_shoulder',mid:'l_elbow',tip:'l_wrist',len_a:0.275,len_b:0.265,hint:[0,-1,0.12]},
  right_arm:{root:'r_shoulder',mid:'r_elbow',tip:'r_wrist',len_a:0.275,len_b:0.265,hint:[0,-1,0.12]},
  left_leg:{root:'l_hip',mid:'l_knee',tip:'l_ankle',len_a:0.435,len_b:0.44,hint:[0,0,1]},
  right_leg:{root:'r_hip',mid:'r_knee',tip:'r_ankle',len_a:0.435,len_b:0.44,hint:[0,0,1]},
};
const CHAIN_BY_TIP = { l_wrist:'left_arm', r_wrist:'right_arm', l_ankle:'left_leg', r_ankle:'right_leg' };

export function coerceTargets(data) {
  if (!data || typeof data !== 'object') return {};
  const targets = data.targets && typeof data.targets === 'object' ? data.targets : data;
  const out = {};
  for (const [k, v] of Object.entries(targets)) out[k] = vec3(v, STAND[k] || [0,0,0]);
  return out;
}
export function lerpTargets(a, b, p) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const out = {};
  for (const k of keys) out[k] = lerp(a[k] || b[k], b[k] || a[k], p);
  return out;
}
const toeFromAnkle = (ankle) => [ankle[0], Math.max(0.03, ankle[1]-0.05), ankle[2]+0.16];

export function buildIkPose(targets, config) {
  const pose = { ...STAND };
  const body = config.body && typeof config.body === 'object' ? config.body : {};
  const shoulderW = +(body.shoulder_width ?? 0.36), hipW = +(body.hip_width ?? 0.20);
  const neckOff = vec3(body.neck_offset || [0,0.15,0], [0,0.15,0]);
  const headOff = vec3(body.head_offset || [0,0.30,0], [0,0.30,0]);
  const pelvis = targets.pelvis || pose.pelvis, chest = targets.chest || pose.chest;
  pose.pelvis = pelvis; pose.chest = chest;
  pose.neck = targets.neck || add(chest, neckOff);
  pose.head = targets.head || add(chest, headOff);
  pose.l_shoulder = targets.l_shoulder || add(chest, [shoulderW/2, 0.12, 0]);
  pose.r_shoulder = targets.r_shoulder || add(chest, [-shoulderW/2, 0.12, 0]);
  pose.l_hip = targets.l_hip || add(pelvis, [hipW/2, 0, 0]);
  pose.r_hip = targets.r_hip || add(pelvis, [-hipW/2, 0, 0]);

  const chainCfg = config.chains && typeof config.chains === 'object' ? config.chains : {};
  const solverCfg = config.solver && typeof config.solver === 'object' ? config.solver : {};
  const allowStretch = !!solverCfg.allow_stretch;
  for (const [name, def] of Object.entries(CHAINS)) {
    const ov = chainCfg[name] && typeof chainCfg[name] === 'object' ? chainCfg[name] : {};
    const rootName = ov.root || def.root, midName = ov.mid || def.mid, tipName = ov.tip || def.tip;
    if (!(rootName in pose)) continue;
    const target = targets[tipName] || pose[tipName];
    if (!target) continue;
    const hint = vec3(ov.hint || def.hint, def.hint);
    const [mid, tip] = solveTwoBone(pose[rootName], target, +(ov.len_a ?? def.len_a), +(ov.len_b ?? def.len_b), hint, allowStretch);
    pose[midName] = mid; pose[tipName] = tip;
  }
  for (const [name, value] of Object.entries(targets)) if (!(name in CHAIN_BY_TIP)) pose[name] = value;
  pose.l_toe = targets.l_toe || toeFromAnkle(pose.l_ankle);
  pose.r_toe = targets.r_toe || toeFromAnkle(pose.r_ankle);
  return pose;
}

// Convenience: full pose at a given rep depth (0=stand, 1=bottom) for an
// ik_3d trainer_animation block — mirrors the coach feeding a depth value.
export function poseAtDepth(anim, depth) {
  const kf = anim.keyframes || {};
  const a = coerceTargets(kf.stand || {});
  const b = coerceTargets(kf.bottom || kf.stand || {});
  return buildIkPose(lerpTargets(a, b, depth), anim);
}

// ── auto-derive rep detection from the posed stickman ───────────────────────
// rig joint → MediaPipe/BlazePose landmark name (what the CM5 tracker measures)
export const RIG_TO_MP = {
  l_shoulder: 'LEFT_SHOULDER', r_shoulder: 'RIGHT_SHOULDER',
  l_elbow: 'LEFT_ELBOW', r_elbow: 'RIGHT_ELBOW',
  l_wrist: 'LEFT_WRIST', r_wrist: 'RIGHT_WRIST',
  l_hip: 'LEFT_HIP', r_hip: 'RIGHT_HIP',
  l_knee: 'LEFT_KNEE', r_knee: 'RIGHT_KNEE',
  l_ankle: 'LEFT_ANKLE', r_ankle: 'RIGHT_ANKLE',
};

// candidate measurable angles (joint at B for the chain A-B-C), both sides
const ANGLE_CANDIDATES = [
  { joint: 'knee', l: ['l_hip', 'l_knee', 'l_ankle'], r: ['r_hip', 'r_knee', 'r_ankle'] },
  { joint: 'elbow', l: ['l_shoulder', 'l_elbow', 'l_wrist'], r: ['r_shoulder', 'r_elbow', 'r_wrist'] },
  { joint: 'hip', l: ['l_shoulder', 'l_hip', 'l_knee'], r: ['r_shoulder', 'r_hip', 'r_knee'] },
  { joint: 'shoulder', l: ['l_hip', 'l_shoulder', 'l_elbow'], r: ['r_hip', 'r_shoulder', 'r_elbow'] },
];

// 3D angle (degrees) at B for the points A-B-C
export function angle3d(A, B, C) {
  const ba = sub(A, B), bc = sub(C, B);
  const m = len(ba) * len(bc);
  if (m < 1e-9) return 180;
  return Math.acos(Math.max(-1, Math.min(1, dot(ba, bc) / m))) * 180 / Math.PI;
}

function angleOf(pose, tri) { return angle3d(pose[tri[0]], pose[tri[1]], pose[tri[2]]); }

// Given the Start and Success poses (as keyframe target dicts), find the joint
// whose angle changes most (the rep "direction") and the down/up thresholds.
export function deriveRep(startTargets, successTargets, anim, forcedJoint = null) {
  const start = buildIkPose(coerceTargets(startTargets), anim);
  const success = buildIkPose(coerceTargets(successTargets), anim);
  let best = null;
  for (const c of ANGLE_CANDIDATES) {
    // average L/R so symmetric moves score cleanly
    const a0 = (angleOf(start, c.l) + angleOf(start, c.r)) / 2;
    const a1 = (angleOf(success, c.l) + angleOf(success, c.r)) / 2;
    const delta = Math.abs(a1 - a0);
    const cand = { ...c, a0, a1, delta };
    if (forcedJoint) { if (c.joint === forcedJoint) best = cand; }
    else if (!best || delta > best.delta) best = cand;
  }
  if (!best) return null;
  const down = Math.round(Math.min(best.a0, best.a1));
  const up = Math.round(Math.max(best.a0, best.a1));
  return {
    joint: best.joint,
    delta: Math.round(best.delta),
    down_angle: down,
    up_angle: up,
    joints_mp: { left: best.l.map((j) => RIG_TO_MP[j]), right: best.r.map((j) => RIG_TO_MP[j]) },
  };
}

const STRICTNESS = { loose: 18, medium: 12, strict: 7 };

// Build a CM5 tracker (rep-detection) config from the derived rep + strictness.
export function buildTrackerConfig(slug, derived, strictness = 'medium') {
  const tol = STRICTNESS[strictness] ?? 12;
  return {
    name: slug,
    joints: derived.joints_mp,
    thresholds: { down_angle: derived.down_angle, up_angle: derived.up_angle },
    trajectory: { buffer: 6 },
    tuning: {
      confirmation_frames: 3, rep_count_mode: 'rebound', rebound_deg: 10,
      count_confirm: 2, depth_target_angle: derived.down_angle, lean_max_deg: 55,
      match_tolerance_deg: tol,
    },
    feedback_rules: [],
  };
}
