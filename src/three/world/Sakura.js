import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createRandom } from '../utils.js';

const blossomVertex = /* glsl */ `
  #include <common>
  #include <fog_pars_vertex>
  attribute float aSize;
  attribute vec3 aColor;
  uniform float uTime;
  uniform float uPixelRatio;
  varying vec3 vColor;
  void main() {
    vColor = aColor;
    vec3 p = position;
    p.x += sin(uTime * 0.8 + position.y * 2.0) * 0.03;
    vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = aSize * uPixelRatio * (220.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const blossomFragment = /* glsl */ `
  #include <common>
  #include <fog_pars_fragment>
  uniform float uIntensity;
  varying vec3 vColor;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.1, d);
    vec3 col = vColor * a * uIntensity;
    float fogFactor = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
    gl_FragColor = vec4(col * (1.0 - fogFactor), 1.0);
  }
`;

const petalVertex = /* glsl */ `
  #include <common>
  #include <fog_pars_vertex>
  attribute vec4 aSeed;
  uniform float uTime;
  uniform float uPixelRatio;
  uniform vec3 uVolume;
  varying float vSpin;
  varying float vFade;
  void main() {
    float speed = 0.35 + aSeed.w * 0.4;
    float t = uTime * speed + aSeed.x * 50.0;
    float fall = mod(t, uVolume.y);
    vec3 p = vec3((aSeed.x - 0.5) * uVolume.x, uVolume.y - fall, (aSeed.z - 0.5) * uVolume.z);
    p.x += sin(t * 1.3 + aSeed.y * 6.28) * 0.7 + fall * 0.35;
    p.z += cos(t * 0.9 + aSeed.z * 6.28) * 0.5;
    vSpin = t * (2.0 + aSeed.y * 3.0);
    vFade = smoothstep(0.0, 0.6, p.y) * smoothstep(uVolume.y, uVolume.y - 1.0, p.y);
    vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = (5.0 + aSeed.y * 5.0) * uPixelRatio * (12.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const petalFragment = /* glsl */ `
  #include <common>
  #include <fog_pars_fragment>
  uniform vec3 uPetalColor;
  varying float vSpin;
  varying float vFade;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float s = sin(vSpin), co = cos(vSpin);
    c = mat2(co, -s, s, co) * c;
    c.x *= 1.0 + 0.6 * abs(sin(vSpin * 0.5));
    float petal = smoothstep(0.32, 0.24, length(c * vec2(1.7, 1.0)));
    if (petal < 0.01) discard;
    vec3 col = uPetalColor * petal * vFade * 0.9;
    float fogFactor = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
    gl_FragColor = vec4(col * (1.0 - fogFactor), 1.0);
  }
`;

/** Blossom colour sets. `petal` tints the falling petals. */
export const SAKURA_PALETTES = {
  pink: { blossoms: ['#ff8fc8', '#ff5fa8', '#ffc2e2', '#ff3d9a'], petal: [1.0, 0.55, 0.78] },
  blue: { blossoms: ['#7fd8ff', '#3fa9ff', '#c2ecff', '#2f7bff'], petal: [0.5, 0.8, 1.0] },
};

export class SakuraTree {
  constructor({ position, scale = 1, seed = 1, rotation = 0, petals = 220, blossoms = 2200, palette = 'pink' }) {
    this.palette = SAKURA_PALETTES[palette] ?? SAKURA_PALETTES.pink;
    this.group = new THREE.Group();
    this.group.position.copy(position);
    this.group.rotation.y = rotation;
    this.group.scale.setScalar(scale);
    this.rng = createRandom(seed);
    this.tips = [];

    this.#createBranches();
    this.#createBlossoms(blossoms);
    this.#createPetals(petals);
  }

  #createBranches() {
    const r = this.rng;
    const geos = [];
    const addBranch = (start, dir, length, radius, depth) => {
      const pts = [start.clone()];
      const d = dir.clone();
      let p = start.clone();
      for (let i = 0; i < 3; i++) {
        d.x += r.range(-0.35, 0.35);
        d.z += r.range(-0.35, 0.35);
        d.y += r.range(-0.1, 0.2);
        d.normalize();
        p = p.clone().addScaledVector(d, length / 3);
        pts.push(p);
      }
      const curve = new THREE.CatmullRomCurve3(pts);
      geos.push(new THREE.TubeGeometry(curve, 8, radius, 6, false));
      const end = pts[pts.length - 1];
      if (depth > 0) {
        const kids = depth === 2 ? 4 : 3;
        for (let k = 0; k < kids; k++) {
          const nd = d.clone().add(new THREE.Vector3(r.range(-0.9, 0.9), r.range(0.0, 0.6), r.range(-0.9, 0.9))).normalize();
          const from = curve.getPoint(r.range(0.6, 1.0));
          addBranch(from, nd, length * r.range(0.55, 0.75), radius * 0.6, depth - 1);
        }
      } else {
        this.tips.push(end.clone());
        this.tips.push(curve.getPoint(0.5));
      }
    };
    // Trunk with a slight lean
    const trunkCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0.15, 1.0, 0.05),
      new THREE.Vector3(0.05, 1.9, -0.1),
      new THREE.Vector3(0.25, 2.6, 0.0),
    ]);
    geos.push(new THREE.TubeGeometry(trunkCurve, 12, 0.2, 8, false));
    const top = trunkCurve.getPoint(1);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + r.range(-0.4, 0.4);
      addBranch(top, new THREE.Vector3(Math.cos(a), 0.7, Math.sin(a)), r.range(1.8, 2.6), 0.11, 2);
    }
    const geometry = mergeGeometries(geos);
    geos.forEach((g) => g.dispose());
    const material = new THREE.MeshStandardMaterial({ color: '#160c12', roughness: 0.85, metalness: 0.1, envMapIntensity: 0.4 });
    const mesh = new THREE.Mesh(geometry, material);
    this.group.add(mesh);
  }

  #createBlossoms(count) {
    const r = this.rng;
    const positions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const colors = new Float32Array(count * 3);
    const palette = this.palette.blossoms.map((c) => new THREE.Color(c));
    for (let i = 0; i < count; i++) {
      const tip = this.tips[i % this.tips.length];
      const rad = Math.pow(r.next(), 0.6) * 0.95;
      const th = r.next() * Math.PI * 2;
      const ph = Math.acos(r.range(-1, 1));
      positions.set(
        [tip.x + rad * Math.sin(ph) * Math.cos(th), tip.y + rad * Math.cos(ph) * 0.7, tip.z + rad * Math.sin(ph) * Math.sin(th)],
        i * 3,
      );
      sizes[i] = r.range(0.6, 1.6);
      const c = r.pick(palette);
      colors.set([c.r, c.g, c.b], i * 3);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
    this.blossomMaterial = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        { uTime: { value: 0 }, uPixelRatio: { value: 1 }, uIntensity: { value: 0.13 } },
      ]),
      vertexShader: blossomVertex,
      fragmentShader: blossomFragment,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: true,
    });
    this.group.add(new THREE.Points(geometry, this.blossomMaterial));
  }

  #createPetals(count) {
    const r = this.rng;
    const seeds = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) seeds.set([r.next(), r.next(), r.next(), r.next()], i * 4);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
    this.petalMaterial = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        {
          uTime: { value: 0 },
          uPixelRatio: { value: 1 },
          uVolume: { value: new THREE.Vector3(9, 5.2, 9) },
          uPetalColor: { value: new THREE.Vector3(...this.palette.petal) },
        },
      ]),
      vertexShader: petalVertex,
      fragmentShader: petalFragment,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: true,
    });
    const points = new THREE.Points(geometry, this.petalMaterial);
    points.frustumCulled = false;
    points.layers.set(1);
    this.group.add(points);
  }

  setPixelRatio(pr) {
    this.blossomMaterial.uniforms.uPixelRatio.value = pr;
    this.petalMaterial.uniforms.uPixelRatio.value = pr;
  }

  update(time) {
    this.blossomMaterial.uniforms.uTime.value = time;
    this.petalMaterial.uniforms.uTime.value = time;
  }
}
