import * as THREE from 'three';
import { damp, smoothstep } from './utils.js';

/**
 * Camera keyframes in story time `s` (see NOTES.md):
 * 0-0.5 street push, 1-1.5 bottle orbit, 1.7-2.5 rise past the project towers,
 * ~2.6 dive through the portal, 2.6-3 hall and shaft, 3-3.5 rooftop.
 */
const KEYS = [
  { s: 0.0, pos: [0.0, 2.1, 50], target: [-3.2, 9.5, -28], fov: 52 },
  { s: 0.25, pos: [0.3, 2.3, 40], target: [-2.6, 10, -28], fov: 52 },
  { s: 0.5, pos: [0.8, 2.6, 27], target: [-1.6, 10, -28], fov: 50 },
  { s: 0.78, pos: [2.6, 2.2, 7.5], target: [10, 2.4, -5.5], fov: 46 },
  { s: 1.0, pos: [4.4, 2.05, -2.4], target: [11.5, 1.7, -6], fov: 42 },
  { s: 1.17, pos: [8.28, 2.15, -3.3], target: [11.5, 1.6, -6], fov: 41 },
  { s: 1.33, pos: [7.32, 1.95, -6.37], target: [11.5, 1.58, -6], fov: 40 },
  { s: 1.5, pos: [8.8, 1.85, -9.22], target: [11.6, 1.62, -6], fov: 41 },
  // Out of the store and up the street; the project towers (LAYOUT.projects) stand to the right
  // and their hoardings come into frame one by one, low to high.
  { s: 1.72, pos: [2.5, 3.6, -10.5], target: [14, 8, -30], fov: 50 },
  // The lens narrows for the farther boards so each one fills about the same part of the frame.
  // Wide establishing view of all three towers, then one board at a time. The camera hovers
  // above the low corner block at LAYOUT.projects.facing.
  { s: 1.9, pos: [7.5, 9.5, -15.5], target: [40, 24, -28], fov: 60 },
  { s: 2.04, pos: [10, 11, -16], target: [28, 13, -33], fov: 50 },
  { s: 2.22, pos: [12, 14.5, -13.5], target: [53, 19, -30], fov: 31 },
  { s: 2.42, pos: [12, 18.5, -14.5], target: [61, 25, -13], fov: 27 },
  { s: 2.5, pos: [12, 19.2, -14.7], target: [61, 25.4, -13.4], fov: 28 },
  // Dive through the portal into the hall
  { s: 2.6, pos: [0.0, 3.6, -25], target: [0, 4.5, -50], fov: 56 },
  { s: 2.68, pos: [1.2, 5.0, -41], target: [0, 6.5, -60], fov: 52 },
  // Rise up the shaft. The view tilts up but never goes vertical: lookAt rolls near the pole,
  // which showed as jitter.
  { s: 2.77, pos: [0.4, 8.5, -50.5], target: [0, 19, -30], fov: 56 },
  { s: 2.88, pos: [0.2, 30, -51.5], target: [-1.5, 40, -18], fov: 54 },
  // Out through the roof opening, then a slow push that keeps the tower right of the text.
  // The last position is LAYOUT.roof.towerFacing.
  { s: 3.0, pos: [0.0, 47.6, -52], target: [-4, 41.5, -10], fov: 50 },
  { s: 3.25, pos: [1.2, 47.4, -51], target: [-5.2, 46.5, -9], fov: 52 },
  { s: 3.5, pos: [2.0, 48.2, -50], target: [-6.2, 53.5, -7.75], fov: 52 },
];

export const STORY_END = KEYS[KEYS.length - 1].s;

export class CameraRig {
  constructor(camera, { reducedMotion = false } = {}) {
    this.camera = camera;
    this.reducedMotion = reducedMotion;
    this.posCurve = new THREE.CatmullRomCurve3(
      KEYS.map((k) => new THREE.Vector3(...k.pos)),
      false,
      'centripetal',
    );
    this.tgtCurve = new THREE.CatmullRomCurve3(
      KEYS.map((k) => new THREE.Vector3(...k.target)),
      false,
      'centripetal',
    );
    this.s = 0;
    this.targetS = 0;
    this.pointer = new THREE.Vector2();
    this.pointerSmooth = new THREE.Vector2();
    this.pos = new THREE.Vector3();
    this.tgt = new THREE.Vector3();
    this.tmp = new THREE.Vector3();
    this.right = new THREE.Vector3();
    this.up = new THREE.Vector3();
    this.baseFov = 50;
    this.sample(0, this.pos, this.tgt);
    this.camera.position.copy(this.pos);
    this.camera.lookAt(this.tgt);
  }

  /** Maps story time to curve parameter so each keyframe lands exactly at its `s`. */
  sample(s, outPos, outTgt) {
    const n = KEYS.length;
    const clamped = Math.min(Math.max(s, 0), STORY_END);
    let i = 0;
    while (i < n - 2 && clamped > KEYS[i + 1].s) i++;
    const a = KEYS[i];
    const b = KEYS[i + 1];
    const local = (clamped - a.s) / (b.s - a.s);
    const u = (i + local) / (n - 1);
    this.posCurve.getPoint(u, outPos);
    this.tgtCurve.getPoint(u, outTgt);
    const t = smoothstep(0, 1, local);
    return a.fov + (b.fov - a.fov) * t;
  }

  setStory(s) {
    this.targetS = s;
  }

  jumpTo(s) {
    this.targetS = s;
    this.s = s;
  }

  setPointer(x, y) {
    this.pointer.set(x, y);
  }

  update(dt, time) {
    this.s = damp(this.s, this.targetS, 4.2, dt);
    const fov = this.sample(this.s, this.pos, this.tgt);

    const motion = this.reducedMotion ? 0 : 1;
    this.pointerSmooth.x = damp(this.pointerSmooth.x, this.pointer.x * motion, 2.5, dt);
    this.pointerSmooth.y = damp(this.pointerSmooth.y, this.pointer.y * motion, 2.5, dt);

    // Camera basis for parallax offsets
    this.tmp.subVectors(this.tgt, this.pos).normalize();
    this.right.crossVectors(this.tmp, THREE.Object3D.DEFAULT_UP);
    // Keep the basis stable if the view ever gets close to vertical
    if (this.right.lengthSq() < 1e-4) this.right.set(1, 0, 0);
    this.right.normalize();
    this.up.crossVectors(this.right, this.tmp).normalize();

    const sway = motion * 0.035;
    this.pos
      .addScaledVector(this.right, this.pointerSmooth.x * 0.45 + Math.sin(time * 0.7) * sway)
      .addScaledVector(this.up, this.pointerSmooth.y * 0.25 + Math.sin(time * 0.9 + 1.3) * sway);
    this.tgt.addScaledVector(this.right, this.pointerSmooth.x * 0.2);

    this.camera.position.copy(this.pos);
    this.camera.lookAt(this.tgt);
    this.baseFov = fov;
    this.applyLens();
  }

  /** Wider lens on portrait screens; lens shift on wide screens so the subject sits right of the text. */
  applyLens() {
    const aspect = this.camera.aspect;
    const portrait = smoothstep(1.25, 0.55, aspect);
    this.camera.fov = this.baseFov * (1 + portrait * 0.42);
    this.camera.filmOffset = -6.5 * smoothstep(1.05, 1.6, aspect);
    this.camera.updateProjectionMatrix();
  }
}
