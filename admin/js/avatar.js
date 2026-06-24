// Avatar player — a faithful JS port of the CM5 procedural-3D solver
// (burnmate_cm5/.../avatar3d/rig.py + ik.py). Same keyframes + two-bone IK →
// the browser renders the SAME pose the board does. This is the "fetch a
// config, play it" core of the dynamic trainer.
import * as THREE from 'three';
import { STAND, BONES, JOINT_SPHERES, ELLIPSOIDS, coerceTargets, lerpTargets, buildIkPose } from './solver.js';

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
    this.renderer.setSize(w, h);
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
    this.mirror = true; this.onEdit = null;
    this.raycaster = new THREE.Raycaster();
    this.dragJoint = null; this.dragPlane = new THREE.Plane();
    const dom = this.renderer.domElement;
    dom.addEventListener('pointerdown', (e) => this._onPointerDown(e));
    dom.addEventListener('pointermove', (e) => this._onPointerMove(e));
    window.addEventListener('pointerup', () => this._onPointerUp());

    new ResizeObserver(() => this._resize()).observe(this.container);
    this._renderOnce();
  }

  // ── editing: drag joints to shape keyframe poses ──────────────────────────
  static DRAG_JOINTS = ['pelvis', 'chest', 'head', 'l_wrist', 'r_wrist', 'l_ankle', 'r_ankle'];

  _buildHandles() {
    this.handleGroup = new THREE.Group(); this.scene.add(this.handleGroup);
    this.handleMeshes = [];
    for (const j of AvatarPlayer.DRAG_JOINTS) {
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(0.055, 14, 12),
        new THREE.MeshBasicMaterial({ color: 0x84cc16, depthTest: false, transparent: true, opacity: 0.95 }));
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
    this.view = this.editAnim.view || 'side'; this._applyView();
    this.setEditKeyframe(this.editAnim.keyframes.stand ? 'stand' : Object.keys(this.editAnim.keyframes)[0] || 'stand');
  }

  endEdit() { this.editing = false; if (this.handleGroup) this.handleGroup.visible = false; }

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
    const t = this._editTargets();
    for (const m of this.handleMeshes) {
      const j = m.userData.joint;
      if (t[j]) { m.position.set(t[j][0], t[j][1], t[j][2]); m.visible = true; }
      else m.visible = false;
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
  _onPointerDown(e) {
    if (!this.editing) return;
    this.raycaster.setFromCamera(this._ndc(e), this.camera);
    const hits = this.raycaster.intersectObjects(this.handleMeshes.filter((m) => m.visible), false);
    if (!hits.length) return;
    this.dragJoint = hits[0].object.userData.joint;
    const n = new THREE.Vector3(); this.camera.getWorldDirection(n);
    this.dragPlane.setFromNormalAndCoplanarPoint(n, hits[0].object.position.clone());
    this.renderer.domElement.style.cursor = 'grabbing';
    e.preventDefault();
  }
  _onPointerMove(e) {
    if (!this.editing) return;
    if (!this.dragJoint) { // hover cursor
      this.raycaster.setFromCamera(this._ndc(e), this.camera);
      this.renderer.domElement.style.cursor =
        this.raycaster.intersectObjects(this.handleMeshes.filter((m) => m.visible), false).length ? 'grab' : '';
      return;
    }
    this.raycaster.setFromCamera(this._ndc(e), this.camera);
    const pt = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.dragPlane, pt)) return;
    const cur = this._editTargets()[this.dragJoint] || STAND[this.dragJoint] || [0, 0, 0];
    let [x, y, z] = [pt.x, pt.y, pt.z];
    if (this.view === 'side') x = cur[0]; else z = cur[2]; // keep poses planar
    y = Math.max(0.03, y); // never below ground
    this._setTarget(this.dragJoint, [x, y, z]);
    this.renderEditPose();
    if (this.onEdit) this.onEdit();
  }
  _onPointerUp() { this.dragJoint = null; if (this.editing) this.renderer.domElement.style.cursor = 'grab'; }

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
    this.renderer.setSize(w, h); this._renderOnce();
  }
  dispose() { this.pause(); this.renderer.dispose(); this.renderer.domElement.remove(); }
}
