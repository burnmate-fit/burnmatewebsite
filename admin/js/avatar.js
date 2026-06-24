// Avatar player — a faithful JS port of the CM5 procedural-3D solver
// (burnmate_cm5/.../avatar3d/rig.py + ik.py). Same keyframes + two-bone IK →
// the browser renders the SAME pose the board does. This is the "fetch a
// config, play it" core of the dynamic trainer.
import * as THREE from 'three';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/TransformControls.js';
import { STAND, BONES, JOINT_SPHERES, ELLIPSOIDS, coerceTargets, lerpTargets, buildIkPose } from './solver.js';

// editor carry-along: moving a joint drags these explicit targets WITH it
// (a bone-hierarchy feel without breaking the flat target data the CM5 reads).
const SUBTREE = {
  pelvis: ['chest', 'l_wrist', 'r_wrist', 'l_ankle', 'r_ankle', 'l_toe', 'r_toe'], // whole body
  chest: ['l_wrist', 'r_wrist'],   // upper body (head/neck/shoulders derive from chest)
  l_ankle: ['l_toe'], r_ankle: ['r_toe'],
};
// rigid bone lengths so the body can't over-stretch (human limits)
const SPINE_LEN = 0.35;   // pelvis ↔ chest rest distance

// ── three.js renderer (math lives in solver.js for parity-testability) ──────
export class AvatarPlayer {
  constructor(container) {
    this.container = container;
    this.anim = null; this.view = 'side';
    this.standT = {}; this.bottomT = {};
    this.depth = 0; this.playing = false; this._raf = null; this._t0 = 0;
    this.onDepth = null;
    this._init();
  }

  _init() {
    const w = this.container.clientWidth || 480, h = this.container.clientHeight || 560;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0d0f0c);
    this.camera = new THREE.PerspectiveCamera(32, w / h, 0.1, 100);
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(w, h, false); // false → don't write px style; canvas fills container via CSS
    Object.assign(this.renderer.domElement.style, { width: '100%', height: '100%', display: 'block' });
    this.container.append(this.renderer.domElement);

    this.scene.add(new THREE.HemisphereLight(0xbfe06a, 0x101410, 0.9));
    const key = new THREE.DirectionalLight(0xffffff, 1.1); key.position.set(2, 4, 3); this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x84cc16, 0.6); rim.position.set(-3, 2, -2); this.scene.add(rim);

    // ground
    const grid = new THREE.GridHelper(6, 12, 0x2a2e25, 0x1b1e18);
    grid.position.y = 0; this.scene.add(grid);

    this.mat = new THREE.MeshStandardMaterial({ color: 0x20251a, roughness: 0.6, metalness: 0.1, emissive: 0x0a0d06 });
    this.group = new THREE.Group(); this.scene.add(this.group);
    this._buildMeshes();
    this._applyView();

    // editing state
    this.editing = false; this.editAnim = null; this.editKf = 'stand';
    this.mirror = true; this.onEdit = null; this.lastPose = STAND; this.selected = null;
    this.raycaster = new THREE.Raycaster();

    // free-orbit camera (edit mode only)
    this.orbit = new OrbitControls(this.camera, this.renderer.domElement);
    this.orbit.target.set(0, 0.9, 0);
    this.orbit.addEventListener('change', () => this._renderOnce());
    this.orbit.enabled = false;

    // move gizmo for the selected handle
    this.gizmo = new TransformControls(this.camera, this.renderer.domElement);
    this.gizmo.setSize(0.62);
    this.gizmo.addEventListener('change', () => this._renderOnce());
    this.gizmo.addEventListener('dragging-changed', (e) => {
      this.orbit.enabled = this.editing && !e.value;
      this._dragLast = (e.value && this.gizmo.object) ? this.gizmo.object.position.clone() : null;
    });
    this.gizmo.addEventListener('objectChange', () => this._onGizmoMove());
    this.scene.add(this.gizmo);

    this.renderer.domElement.addEventListener('pointerdown', (e) => this._onPointerDown(e));

    new ResizeObserver(() => this._resize()).observe(this.container);
    this._renderOnce();
  }

  // ── editing: select a handle → move it with the gizmo; IK re-solves ───────
  // Full destination rig — every major joint is a draggable destination.
  static DRAG_JOINTS = [
    'pelvis', 'chest', 'neck', 'head', 'l_shoulder', 'r_shoulder',
    'l_elbow', 'r_elbow', 'l_wrist', 'r_wrist', 'l_hip', 'r_hip',
    'l_knee', 'r_knee', 'l_ankle', 'r_ankle', 'l_toe', 'r_toe',
  ];

  _buildHandles() {
    this.handleGroup = new THREE.Group(); this.scene.add(this.handleGroup);
    this.handleMeshes = [];
    for (const j of AvatarPlayer.DRAG_JOINTS) {
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(0.05, 14, 12),
        new THREE.MeshBasicMaterial({ color: 0x84cc16, depthTest: false, transparent: true, opacity: 0.85 }));
      m.userData.joint = j; m.renderOrder = 999; m.visible = false;
      this.handleGroup.add(m); this.handleMeshes.push(m);
    }
  }

  beginEdit(anim, onEdit) {
    this.pause();
    this.editing = true; this.onEdit = onEdit;
    this.editAnim = JSON.parse(JSON.stringify(anim || {}));
    this.editAnim.keyframes = this.editAnim.keyframes || {};
    for (const k of Object.keys(this.editAnim.keyframes)) {
      const kf = this.editAnim.keyframes[k];
      if (kf && !kf.targets) this.editAnim.keyframes[k] = { targets: { ...kf } };
    }
    if (!this.handleMeshes) this._buildHandles();
    this.handleGroup.visible = true;
    this.orbit.enabled = true; this.gizmo.detach(); this.selected = null;
    this.view = this.editAnim.view || 'side'; this._applyView();
    this.setEditKeyframe(this.editAnim.keyframes.stand ? 'stand' : Object.keys(this.editAnim.keyframes)[0] || 'stand');
  }

  endEdit() {
    this.editing = false;
    if (this.handleGroup) this.handleGroup.visible = false;
    if (this.orbit) this.orbit.enabled = false;
    if (this.gizmo) this.gizmo.detach();
  }

  _defaultTargets() {
    const pick = ['pelvis', 'chest', 'l_wrist', 'r_wrist', 'l_ankle', 'r_ankle', 'l_toe', 'r_toe'];
    return Object.fromEntries(pick.map((j) => [j, [...STAND[j]]]));
  }

  setEditKeyframe(name) {
    if (!this.editAnim.keyframes[name]) this.editAnim.keyframes[name] = { targets: this._defaultTargets() };
    this.editKf = name;
    this.renderEditPose();
  }

  keyframeNames() { return Object.keys(this.editAnim?.keyframes || {}); }
  _editTargets() { return this.editAnim.keyframes[this.editKf].targets; }
  renderEditPose() { this._applyPose(buildIkPose(this._editTargets(), this.editAnim)); }
  getEditedAnim() { return this.editAnim; }

  _placeHandles() {
    // place every handle at its SOLVED position (so all joints are grabbable,
    // even ones not yet explicit destinations); skip the one being dragged.
    for (const m of this.handleMeshes) {
      if (this.gizmo && this.gizmo.dragging && m === this.gizmo.object) continue;
      const j = m.userData.joint;
      const p = (this.lastPose && this.lastPose[j]) || STAND[j];
      if (p) { m.position.set(p[0], p[1], p[2]); m.visible = true; } else m.visible = false;
    }
  }

  _setTarget(joint, pos) {
    const t = this._editTargets();
    t[joint] = pos;
    if (this.mirror) {
      const m = joint.startsWith('l_') ? 'r_' + joint.slice(2) : joint.startsWith('r_') ? 'l_' + joint.slice(2) : null;
      if (m && t[m]) t[m] = [-pos[0], pos[1], pos[2]];
    }
  }

  _ndc(e) {
    const r = this.renderer.domElement.getBoundingClientRect();
    return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  }
  // click a handle → attach the move gizmo to it (don't steal gizmo-arrow clicks)
  _onPointerDown(e) {
    if (!this.editing || (this.gizmo && this.gizmo.dragging)) return;
    this.raycaster.setFromCamera(this._ndc(e), this.camera);
    const hits = this.raycaster.intersectObjects(this.handleMeshes.filter((m) => m.visible), false);
    if (hits.length) this._selectHandle(hits[0].object);
  }
  _selectHandle(mesh) {
    this.selected = mesh.userData.joint;
    this.gizmo.attach(mesh);
    for (const m of this.handleMeshes) m.material.opacity = (m === mesh) ? 1 : 0.6;
    this._renderOnce();
    if (this.onSelect) this.onSelect(this.selected);
  }
  setGizmoMode(mode) { if (this.gizmo) this.gizmo.setMode(mode); }
  // gizmo moved the handle → carry the subtree, apply human limits, re-solve
  _onGizmoMove() {
    if (!this.editing || !this.gizmo.object) return;
    const j = this.gizmo.object.userData.joint;
    const p = this.gizmo.object.position.clone();
    if (!this._dragLast) this._dragLast = p.clone();
    const d = [p.x - this._dragLast.x, p.y - this._dragLast.y, p.z - this._dragLast.z];
    const t = this._editTargets();
    // carry-along: shift the moved joint's subtree by the same delta
    for (const k of (SUBTREE[j] || [])) if (t[k]) t[k] = [t[k][0] + d[0], t[k][1] + d[1], t[k][2] + d[2]];
    this._setTarget(j, [p.x, Math.max(0.03, p.y), p.z]);
    this._constrain(t);
    this._dragLast = p;
    this._applyPose(buildIkPose(t, this.editAnim));
    if (this.onEdit) this.onEdit();
  }

  // human limits: rigid spine (no stretch) + keep feet on the ground.
  // Limb over-extension is already prevented by the two-bone IK reach clamp.
  _constrain(t) {
    if (t.pelvis && t.chest) {
      const dx = t.chest[0] - t.pelvis[0], dy = t.chest[1] - t.pelvis[1], dz = t.chest[2] - t.pelvis[2];
      const L = Math.hypot(dx, dy, dz) || 1e-4, s = SPINE_LEN / L;
      t.chest = [t.pelvis[0] + dx * s, t.pelvis[1] + dy * s, t.pelvis[2] + dz * s];
    }
    for (const k of ['l_ankle', 'r_ankle', 'l_toe', 'r_toe']) if (t[k]) t[k][1] = Math.max(0.03, t[k][1]);
  }

  _buildMeshes() {
    this.bones = BONES.map(([, , r]) => {
      const g = new THREE.CylinderGeometry(r, r, 1, 16);
      const m = new THREE.Mesh(g, this.mat); m.userData.r = r; this.group.add(m); return m;
    });
    this.joints = {};
    for (const [name, r] of JOINT_SPHERES) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), this.mat); this.joints[name] = m; this.group.add(m);
    }
    this.ellipsoids = ELLIPSOIDS.map(([name, s]) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 16), this.mat);
      m.scale.set(...s); m.userData.name = name; this.group.add(m); return m;
    });
    // hands + feet as small accents
    this.accents = { l_wrist: 0.05, r_wrist: 0.05 };
    this.hands = {};
    for (const k of ['l_wrist', 'r_wrist']) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.058, 12, 10), this.mat); this.hands[k] = m; this.group.add(m);
    }
    this.feet = {};
    for (const k of ['l_ankle', 'r_ankle']) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.06, 0.22), this.mat); this.feet[k] = m; this.group.add(m);
    }
  }

  _applyView() {
    if (this.view === 'front') this.camera.position.set(0, 0.95, 3.4);
    else this.camera.position.set(3.4, 0.95, 0.0); // side: look down -X
    this.camera.lookAt(0, 0.9, 0);
    if (this.orbit) { this.orbit.target.set(0, 0.9, 0); this.orbit.update(); }
  }

  setConfig(anim) {
    this.anim = anim || {};
    this.view = (this.anim.view || 'side');
    const kf = this.anim.keyframes || {};
    this.standT = coerceTargets(kf.stand || {});
    this.bottomT = coerceTargets(kf.bottom || kf.stand || {});
    this._applyView();
    this.setDepth(this.depth);
  }

  _poseAt(depth) {
    if (!this.anim) return STAND;
    const targets = lerpTargets(this.standT, this.bottomT, depth);
    return buildIkPose(targets, this.anim);
  }

  _applyPose(pose) {
    this.lastPose = pose;
    const V = (n) => { const p = pose[n] || STAND[n] || [0,0,0]; return new THREE.Vector3(p[0], p[1], p[2]); };
    const up = new THREE.Vector3(0, 1, 0);
    BONES.forEach(([a, b], i) => {
      const pa = V(a), pb = V(b); const mesh = this.bones[i];
      const d = new THREE.Vector3().subVectors(pb, pa); const L = d.length() || 1e-4;
      mesh.position.copy(pa).add(pb).multiplyScalar(0.5);
      mesh.quaternion.setFromUnitVectors(up, d.clone().normalize());
      mesh.scale.set(1, L, 1);
    });
    for (const [name] of JOINT_SPHERES) this.joints[name].position.copy(V(name));
    for (const m of this.ellipsoids) m.position.copy(V(m.userData.name));
    for (const k of ['l_wrist', 'r_wrist']) this.hands[k].position.copy(V(k));
    for (const k of ['l_ankle', 'r_ankle']) {
      const ankle = V(k); const toe = V(k.replace('ankle', 'toe'));
      this.feet[k].position.copy(ankle).add(toe).multiplyScalar(0.5);
    }
    if (this.editing && this.handleMeshes) this._placeHandles();
    this._renderOnce();
  }

  setDepth(depth) {
    this.depth = Math.max(0, Math.min(1, depth));
    this._applyPose(this._poseAt(this.depth));
    if (this.onDepth) this.onDepth(this.depth);
  }

  play(period = 2.4) {
    if (this.playing) return; this.playing = true; this._t0 = performance.now();
    const tick = (now) => {
      if (!this.playing) return;
      const t = ((now - this._t0) / 1000) % period / period; // 0..1
      // triangle wave: descend 0→1 then ascend 1→0, eased (cosine)
      const tri = t < 0.5 ? t * 2 : (1 - t) * 2;
      const eased = 0.5 - 0.5 * Math.cos(tri * Math.PI);
      this.setDepth(eased);
      this._raf = requestAnimationFrame(tick);
    };
    this._raf = requestAnimationFrame(tick);
  }
  pause() { this.playing = false; if (this._raf) cancelAnimationFrame(this._raf); }

  _renderOnce() { this.renderer.render(this.scene, this.camera); }
  _resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    if (!w || !h) return;
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false); this._renderOnce();
  }
  dispose() { this.pause(); this.renderer.dispose(); this.renderer.domElement.remove(); }
}
