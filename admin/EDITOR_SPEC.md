# Trainer Designer — Complete Exercise Editor (design spec)

Goal: a **seamless, fully-editable exercise designer** — add a new exercise by
dragging a stickman's destinations, set every field inline, mark success points,
test it, and save a complete exercise. Built on our own analytic IK solver
(parity-matched to the CM5), borrowing UX from the mature tools.

## Core idea: a destination-driven rig
You place the **IK destinations** (the control handles). Those alone decide the
animation — and a subset are flagged as **success points** that drive rep
detection. Because the handles map to **BlazePose's landmarks** (what the camera
measures), the success points are directly trackable. One model, no translation.

```
drag destinations ──▶ IK solve ──▶ keyframe pose ──▶ animation (interp keyframes)
        └────────────────────────────────▶ success points (angle rules) ──▶ rep detection
```

## 1. The control rig (the "1–22 destinations")
~18 handles, each a draggable destination, mapped to MediaPipe/BlazePose landmarks:

| Group | Handles | Role |
|---|---|---|
| Core | pelvis, chest, neck, head | body anchors |
| Shoulders/Hips | l/r_shoulder, l/r_hip | girdle |
| Pole targets | l/r_elbow, l/r_knee | bend direction (control rig "pole vector") |
| IK targets | l/r_wrist, l/r_ankle | end-effectors |
| Tips | l/r_toe (feet), hands | foot/hand orientation |

- Drag an **end-effector** (wrist/ankle) → two-bone IK solves the limb.
- Drag a **pole** (elbow/knee) → sets the bend plane (replaces the static hint).
- Drag an **anchor** (pelvis/chest) → moves the body; limbs follow.
- Any handle becomes an explicit destination when you touch it; untouched ones
  stay solved. All handles are always grabbable (shown at their solved position).

## 2. Posing UX (seamless — from the mature tools)
- **OrbitControls** — free-rotate the camera (not locked to side/front).
- **TransformControls gizmo** — click a handle → move/rotate gizmo with axis
  constraints (Magic Poser = IK drag, JustSketchMe = rotate; we offer both).
- **Mirror L/R**, **snap to ground**, **reset pose**, **view presets** (side/front/¾).
- Handles colour-coded by group; selected handle highlighted.

## 3. Timeline / keyframes (model after Theatre.js)
- A **keyframe strip**: Stand → Descend → Bottom → Ascend (+ add/rename/reorder).
- Each keyframe = a full set of destinations. **Scrub** to preview interpolation.
- **Onion-skin**: ghost the neighbouring keyframe while posing.
- Per-phase **tempo/easing**.

## 4. Success points (rep detection) — the unification
- Mark a control point (or a 3-joint angle) as a **success point**:
  - **Angle rule**: pick 3 landmarks → target angle, comparison (≥/≤), tolerance, weight.
  - **Rep trigger**: the down/up angle that counts a rep (e.g. knee 115°→155°).
- The editor **draws the angle live** on the avatar (arc + degrees) as you pose.
- Saved to the **tracker config** (rep thresholds + checkpoints) — exactly what the
  CM5 rep counter consumes. Same landmarks the webcam reads.

## 5. Fully-editable fields (inline)
Everything about the exercise, editable in place:
name, slug, muscle group, aliases, **sets / reps / rest**, equipment, difficulty,
primary muscles, instructions, image/video. Drag to reorder sets.

## 6. Save · Test · Deploy
- **Save** = one action writes all three: trainer config (animation) + tracker
  config (rep detection from success points) + registry entry. A complete exercise.
- **Live webcam test** — MediaPipe BlazePose in the browser; do the rep, watch it
  count + checkpoints pass/fail before deploying. (Same scoring math as the board.)
- **Deploy to CM5** — via the validated cloud→cache fetch (admin plan §6).

## 7. Library
Preloaded starter exercises + pose presets to clone from, not a blank canvas.

---

## Build order
1. **Destination rig + gizmo** — full handle set, OrbitControls + TransformControls,
   IK re-solve on drag. *(starting now)*
2. **Success points** — angle-rule editor + live arc viz; save tracker config.
3. **Timeline** — multi-keyframe strip + onion-skin + scrub.
4. **Inline fields** — full editable metadata + sets/reps.
5. **Webcam live-test** — BlazePose in-browser + checkpoint scoring.
6. **Deploy to CM5** — validated fetch/cache path.

## Tech decisions
- **Keep our analytic 2-bone IK** (CM5 parity). Add **pole targets** for bend control.
- **three.js addons**: OrbitControls + TransformControls (no new deps).
- **Timeline**: model on Theatre.js; build lightweight custom (avoid coupling our
  skeletal data to Theatre's object-prop model).
- **Landmarks = BlazePose 33** so success points are camera-measurable as-is.

## References
- PoseMy.Art, Magic Poser (IK-drag), JustSketchMe (joint-rotate), KineBody — posing UX
- three.js TransformControls / OrbitControls — gizmo + camera
- Theatre.js — web timeline/keyframe editor
- MediaPipe BlazePose (33 landmarks) — pose + success-point vocabulary
- Control-rig theory: IK target + pole vector + root per limb; full-body IK
