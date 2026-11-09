import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createRandom, PALETTE } from '../utils.js';

/** Pedestrians with neon-shaft umbrellas, plus flying traffic lanes above the streets. */
export class Life {
  constructor({ quality }) {
    this.group = new THREE.Group();
    this.group.name = 'Life';
    this.rng = createRandom(404);
    this.#createPedestrians(quality === 'low' ? 8 : 14);
    this.#createTraffic(quality === 'low' ? 12 : 22);
  }

  #createPedestrians(count) {
    const r = this.rng;
    const body = mergeGeometries([
      new THREE.CapsuleGeometry(0.2, 1.05, 4, 8).translate(0, 0.78, 0),
      new THREE.SphereGeometry(0.13, 10, 8).translate(0, 1.5, 0),
    ]);
    const canopy = new THREE.ConeGeometry(0.62, 0.28, 16, 1, true).translate(0, 2.02, 0);
    const shaft = new THREE.CylinderGeometry(0.018, 0.018, 1.0, 6).translate(0, 1.52, 0);

    const bodyMat = new THREE.MeshStandardMaterial({ color: '#07060b', roughness: 0.55, metalness: 0.2, envMapIntensity: 0.6 });
    const canopyMat = new THREE.MeshStandardMaterial({
      color: '#0b0a12',
      roughness: 0.25,
      metalness: 0.1,
      transparent: true,
      opacity: 0.88,
      side: THREE.DoubleSide,
      envMapIntensity: 1.2,
    });
    const shaftMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 3, 3) });

    this.bodies = new THREE.InstancedMesh(body, bodyMat, count);
    this.canopies = new THREE.InstancedMesh(canopy, canopyMat, count);
    this.shafts = new THREE.InstancedMesh(shaft, shaftMat, count);
    const colors = [PALETTE.cyan, PALETTE.pink, PALETTE.red, PALETTE.violet, PALETTE.cyan];
    const c = new THREE.Color();

    this.people = [];
    for (let i = 0; i < count; i++) {
      const lane = i % 7 === 6 ? 'cross' : i % 3 === 2 ? 'right' : 'left';
      const p = {
        lane,
        dir: r.chance(0.5) ? 1 : -1,
        speed: r.range(0.9, 1.5),
        phase: r.next() * 10,
        x: lane === 'left' ? r.range(-7.6, -6.4) : lane === 'right' ? r.range(6.4, 7.4) : r.range(-5, 5),
        z: lane === 'cross' ? r.range(-25, -21) : lane === 'right' ? r.range(3, 70) : r.range(-24, 70),
      };
      this.people.push(p);
      this.shafts.setColorAt(i, c.set(r.pick(colors)));
    }
    if (this.shafts.instanceColor) this.shafts.instanceColor.needsUpdate = true;
    for (const m of [this.bodies, this.canopies, this.shafts]) {
      m.frustumCulled = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.group.add(m);
    }
    this.dummy = new THREE.Object3D();
  }

  #createTraffic(count) {
    const r = this.rng;
    const bodyGeo = new THREE.BoxGeometry(2.4, 0.55, 1.05);
    const lightGeo = new THREE.BoxGeometry(0.06, 0.08, 0.9);
    const bodyMat = new THREE.MeshStandardMaterial({ color: '#0d0c14', roughness: 0.3, metalness: 0.8, envMapIntensity: 1.2 });
    const headMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 4.2, 5) });
    const tailMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 0.3, 0.4) });
    this.carBodies = new THREE.InstancedMesh(bodyGeo, bodyMat, count);
    this.carHeads = new THREE.InstancedMesh(lightGeo, headMat, count);
    this.carTails = new THREE.InstancedMesh(lightGeo, tailMat, count);

    // Lanes: [start, end, height range]
    const lanes = [
      { a: [-2.5, 0, 95], b: [-2.5, 0, -24], y: [13, 17] },
      { a: [2.5, 0, -24], b: [2.5, 0, 95], y: [15, 19] },
      { a: [-120, 0, 20], b: [120, 0, 20], y: [24, 30] },
      // Starts inside project tower 3 and flies above the chapter 3 camera and hoardings
      { a: [60, 0, -14], b: [-120, 0, -14], y: [33, 38] },
      { a: [-160, 0, 60], b: [160, 0, 40], y: [52, 62] },
      { a: [150, 0, -100], b: [-150, 0, 120], y: [60, 72] },
      { a: [-40, 0, 140], b: [40, 0, -160], y: [56, 66] },
    ];
    this.cars = [];
    for (let i = 0; i < count; i++) {
      const lane = lanes[i % lanes.length];
      const a = new THREE.Vector3(...lane.a);
      const b = new THREE.Vector3(...lane.b);
      a.y = b.y = r.range(...lane.y);
      this.cars.push({ a, b, t: r.next(), speed: r.range(10, 22) / a.distanceTo(b), bob: r.next() * 6 });
    }
    for (const m of [this.carBodies, this.carHeads, this.carTails]) {
      m.frustumCulled = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.group.add(m);
    }
    this.carPos = new THREE.Vector3();
    this.carDir = new THREE.Vector3();
    this.offset = new THREE.Vector3();
  }

  update(time, dt) {
    const d = this.dummy;
    this.people.forEach((p, i) => {
      if (p.lane === 'cross') {
        p.x += p.dir * p.speed * dt;
        if (p.x > 6) p.x = -6;
        if (p.x < -6) p.x = 6;
      } else {
        const min = p.lane === 'right' ? 3 : -24;
        p.z += p.dir * p.speed * dt;
        if (p.z > 72) p.z = min;
        if (p.z < min) p.z = 72;
      }
      const step = time * p.speed * 5.5 + p.phase;
      d.position.set(p.x, Math.abs(Math.sin(step)) * 0.045, p.z);
      d.rotation.set(0, p.lane === 'cross' ? (p.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : p.dir > 0 ? 0 : Math.PI, Math.sin(step) * 0.03);
      d.updateMatrix();
      this.bodies.setMatrixAt(i, d.matrix);
      this.canopies.setMatrixAt(i, d.matrix);
      this.shafts.setMatrixAt(i, d.matrix);
    });
    this.bodies.instanceMatrix.needsUpdate = true;
    this.canopies.instanceMatrix.needsUpdate = true;
    this.shafts.instanceMatrix.needsUpdate = true;

    this.cars.forEach((c, i) => {
      c.t = (c.t + c.speed * dt) % 1;
      this.carPos.lerpVectors(c.a, c.b, c.t);
      this.carPos.y += Math.sin(time * 0.8 + c.bob) * 0.25;
      this.carDir.subVectors(c.b, c.a).normalize();
      const yaw = Math.atan2(-this.carDir.z, this.carDir.x);
      d.position.copy(this.carPos);
      d.rotation.set(0, yaw, Math.sin(time + c.bob) * 0.03);
      d.updateMatrix();
      this.carBodies.setMatrixAt(i, d.matrix);
      // Lights sit at the front and back of the body along its local x axis
      this.offset.set(1.22, 0, 0).applyEuler(d.rotation);
      d.position.copy(this.carPos).add(this.offset);
      d.updateMatrix();
      this.carHeads.setMatrixAt(i, d.matrix);
      d.position.copy(this.carPos).sub(this.offset);
      d.updateMatrix();
      this.carTails.setMatrixAt(i, d.matrix);
    });
    this.carBodies.instanceMatrix.needsUpdate = true;
    this.carHeads.instanceMatrix.needsUpdate = true;
    this.carTails.instanceMatrix.needsUpdate = true;
  }
}
