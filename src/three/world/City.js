import * as THREE from 'three';
import { createRandom, GLSL_NOISE, PALETTE } from '../utils.js';
import { LAYOUT, projectTowerYaw } from '../layout.js';
import { signAtlasTexture } from '../textures.js';

/* -------------------------------------------------------------------------- */
/* Building shader: windows are computed procedurally in building space, so   */
/* every instance can have its own size without stretched textures.           */
/* -------------------------------------------------------------------------- */

const buildingVertex = /* glsl */ `
  #include <common>
  #include <fog_pars_vertex>
  attribute vec3 aSize;
  attribute vec4 aData;
  varying vec3 vWorld;
  varying vec3 vNormalL;
  varying vec3 vLocal;
  varying vec3 vSize;
  varying vec4 vData;
  void main() {
    mat4 im = mat4(1.0);
    #ifdef USE_INSTANCING
      im = instanceMatrix;
    #endif
    vec4 world = modelMatrix * im * vec4(position, 1.0);
    vWorld = world.xyz;
    // Box-space normal: picks the facade even when an instance is rotated
    vNormalL = normal;
    vSize = aSize;
    vLocal = (position + 0.5) * aSize;
    vData = aData;
    vec4 mvPosition = viewMatrix * world;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const buildingFragment = /* glsl */ `
  #include <common>
  #include <fog_pars_fragment>
  uniform float uTime;
  uniform vec3 uBase;
  uniform vec3 uGlowLow;
  varying vec3 vWorld;
  varying vec3 vNormalL;
  varying vec3 vLocal;
  varying vec3 vSize;
  varying vec4 vData;
  ${GLSL_NOISE}

  vec3 windowColor(float r) {
    if (r < 0.52) return vec3(1.0, 0.72, 0.46);
    if (r < 0.70) return vec3(0.62, 0.42, 1.0);
    if (r < 0.84) return vec3(1.0, 0.28, 0.62);
    if (r < 0.95) return vec3(0.35, 0.86, 1.0);
    return vec3(0.9, 0.95, 1.0);
  }

  void main() {
    vec3 n = normalize(vNormalL);
    float seed = vData.x;
    vec3 col = uBase;
    float face = 0.0;
    float u = -1.0;
    float width = 1.0;
    if (abs(n.x) > 0.5) { u = vLocal.z; width = vSize.z; face = n.x > 0.0 ? 1.0 : 2.0; }
    else if (abs(n.z) > 0.5) { u = vLocal.x; width = vSize.x; face = n.z > 0.0 ? 3.0 : 4.0; }

    if (u >= 0.0) {
      float floorH = vData.y;
      float colW = vData.z;
      float litP = vData.w;
      // Darken the facade a little toward the top, warm it near the street
      col *= mix(1.25, 0.8, clamp(vWorld.y / 80.0, 0.0, 1.0));
      col += uGlowLow * exp(-vWorld.y * 0.12);

      vec2 g = vec2(u / colW, vLocal.y / floorH);
      vec2 cell = floor(g);
      vec2 f = fract(g);
      float inset = step(0.6, width - u) * step(0.6, u); // keep corners solid
      // Some buildings use ribbon windows (continuous bands), others a grid
      float ribbon = step(0.72, hash12(vec2(seed, 3.7)));
      float px = mix(step(0.22, f.x) * step(f.x, 0.78), 1.0, ribbon);
      float pane = px * step(0.34, f.y) * step(f.y, 0.72) * inset;
      // Lit windows cluster by floor and by bay, like real offices and flats
      float rFloor = hash12(vec2(cell.y, seed * 7.3 + face));
      float rBay = hash12(vec2(floor(cell.x / 3.0), seed * 1.9 + face));
      float r = hash12(cell + seed * 13.7 + face * 7.1);
      float lit = step(1.0 - litP, r * 0.6 + rFloor * 0.25 + rBay * 0.15);
      float flicker = 1.0;
      if (r > 0.985) flicker = 0.4 + 0.6 * step(0.5, fract(sin(uTime * 3.0 + r * 91.0) * 43758.5453));
      vec3 wc = windowColor(hash12(cell * 1.71 + seed));
      float bright = (0.05 + 0.3 * hash12(cell + 4.2)) * lit * flicker;
      // Unlit glass still catches a little sky and neon
      float glass = pane * (1.0 - lit) * 0.012;

      // Anti-alias: far away, fade the grid into its average brightness
      float fw = max(fwidth(g.x), fwidth(g.y));
      float aa = clamp(1.0 - (fw - 0.3) * 2.0, 0.0, 1.0);
      float avg = litP * 0.2 * 0.25;
      float emission = mix(avg, pane * bright, aa);
      vec3 winCol = mix(vec3(0.95, 0.6, 0.8), wc, aa);
      col += winCol * emission + vec3(0.25, 0.3, 0.5) * glass * aa;
      // Floor slabs: thin darker lines that read as structure
      col *= 1.0 - 0.35 * smoothstep(0.06, 0.0, f.y) * aa;

      // Ground floor shopfronts
      if (vWorld.y < 4.2 && vWorld.y > 0.0) {
        float seg = floor(u / 4.6);
        float sf = fract(u / 4.6);
        float rs = hash12(vec2(seg, seed * 3.1 + face));
        vec3 sc = rs < 0.33 ? vec3(1.0, 0.25, 0.55) : (rs < 0.6 ? vec3(0.3, 0.85, 1.0) : (rs < 0.8 ? vec3(1.0, 0.7, 0.45) : vec3(0.6, 0.4, 1.0)));
        float shop = step(0.08, sf) * step(sf, 0.92) * step(0.35, vWorld.y) * step(vWorld.y, 3.4) * inset;
        float open = step(0.3, hash12(vec2(seg + 2.0, seed)));
        float shutter = 0.5 + 0.5 * sin(vWorld.y * 40.0);
        // Interior falloff so shop windows read as lit rooms, not flat panels
        float depthFake = 0.55 + 0.45 * smoothstep(0.35, 3.4, vWorld.y) * (1.0 - abs(sf - 0.5));
        col = mix(col, sc * (open > 0.5 ? 0.17 * depthFake : 0.02 * shutter), shop);
        // Awning light strip
        float strip = smoothstep(0.06, 0.0, abs(vWorld.y - 3.75)) * inset;
        col += sc * strip * 0.7 * open;
      }
    } else if (n.y > 0.5) {
      col = uBase * 1.6 + vec3(0.01, 0.006, 0.016) * vnoise(vWorld.xz * 0.5);
    } else {
      col = uBase * 0.6;
    }

    gl_FragColor = vec4(col, 1.0);
    #include <fog_fragment>
  }
`;

function createBuildingMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uTime: { value: 0 },
        uBase: { value: new THREE.Color('#0d0a16') },
        uGlowLow: { value: new THREE.Color('#2a0c2a') },
      },
    ]),
    vertexShader: buildingVertex,
    fragmentShader: buildingFragment,
    fog: true,
  });
}

/* -------------------------------------------------------------------------- */
/* Sign shader: instanced quads sampling from one atlas                        */
/* -------------------------------------------------------------------------- */

const signVertex = /* glsl */ `
  #include <common>
  #include <fog_pars_vertex>
  attribute vec4 aRect;
  attribute vec2 aParams;
  varying vec2 vUv;
  varying vec4 vRect;
  varying vec2 vParams;
  void main() {
    vUv = uv;
    vRect = aRect;
    vParams = aParams;
    mat4 im = mat4(1.0);
    #ifdef USE_INSTANCING
      im = instanceMatrix;
    #endif
    vec4 mvPosition = viewMatrix * modelMatrix * im * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const signFragment = /* glsl */ `
  #include <common>
  #include <fog_pars_fragment>
  uniform sampler2D uAtlas;
  uniform float uTime;
  uniform float uIntensity;
  varying vec2 vUv;
  varying vec4 vRect;
  varying vec2 vParams;
  void main() {
    vec2 uv = vUv;
    if (!gl_FrontFacing) uv.x = 1.0 - uv.x;
    vec3 tex = texture2D(uAtlas, vRect.xy + uv * vRect.zw).rgb;
    float s = vParams.x;
    // Occasional flicker: a few signs dip now and then, most hum steadily.
    // About 1.5-2 slots per second (was 9-21), and each dip fades in and out instead of snapping.
    float t = uTime * (1.4 + s * 0.8) + s * 40.0;
    float slot = fract(t);
    float off = step(0.9, fract(sin(floor(t) * 12.9898 + s) * 43758.5453));
    float stutter = step(0.86, s) * off * smoothstep(0.0, 0.15, slot) * (1.0 - smoothstep(0.85, 1.0, slot));
    float hum = 0.95 + 0.05 * sin(uTime * 4.0 + s * 30.0);
    float k = uIntensity * vParams.y * hum * (1.0 - 0.85 * stutter);
    gl_FragColor = vec4(tex * k, 1.0);
    #include <fog_fragment>
  }
`;

export class City {
  constructor({ quality }) {
    this.group = new THREE.Group();
    this.group.name = 'City';
    this.rng = createRandom(2024);
    this.buildings = [];
    this.tallRoofs = [];
    this.facadeSpots = { left: [], right: [] };

    this.buildingMaterial = createBuildingMaterial();
    this.#layoutBuildings(quality);
    this.#createBuildingMesh();
    this.#createNeonStrips();
    this.#createSigns();
    this.#createAircraftLights();
  }

  #add(x0, x1, z0, z1, h, opts = {}) {
    const r = this.rng;
    const b = {
      x: (x0 + x1) / 2,
      z: (z0 + z1) / 2,
      w: Math.abs(x1 - x0),
      d: Math.abs(z1 - z0),
      h,
      y0: opts.y0 ?? 0,
      floor: opts.floor ?? r.range(2.6, 3.4),
      col: opts.col ?? r.range(1.0, 1.7),
      lit: opts.lit ?? r.range(0.12, 0.34),
      seed: r.next() * 100,
      side: opts.side ?? null,
      rotY: opts.rotY ?? 0,
    };
    this.buildings.push(b);
    if (h + b.y0 > 34 && opts.beacon !== false) this.tallRoofs.push(b);
    return b;
  }

  #layoutBuildings(quality) {
    const r = this.rng;
    const { street, ds, store } = LAYOUT;

    // Street-side rows (both sides)
    for (const side of [-1, 1]) {
      let z = street.zMin;
      while (z < street.zMax) {
        const depth = r.range(7, 14);
        const z0 = z;
        const z1 = Math.min(z + depth, street.zMax);
        const isStore = side === 1 && z1 > store.zMin - 1 && z0 < store.zMax + 1;
        if (isStore) {
          // Store slot: upper floors only, the store room is built separately
          this.#add(street.halfWalk, store.backX + 4, store.zMin - 1, store.zMax + 1, 16, { y0: store.height + 0.2, side, lit: 0.3 });
          z = store.zMax + 1 + 0.4;
          continue;
        }
        const width = r.range(9, 18);
        const bz = LAYOUT.billboard.position.z;
        const nearBillboard = side === LAYOUT.billboard.side && z1 > bz - 8 && z0 < bz + 6;
        // The first block on the right stays low so chapter 3 can see the project towers over it
        const lowCorner = side === 1 && z0 < LAYOUT.street.zMin + 4;
        const h = nearBillboard ? r.range(26, 34) : lowCorner ? r.range(7, 9) : r.range(12, 46);
        const b = this.#add(side * street.halfWalk, side * (street.halfWalk + width), z0, z1, h, { side });
        this.facadeSpots[side < 0 ? 'left' : 'right'].push(b);
        z = z1 + r.range(0.2, 1.2);
      }
      // Second row, taller. On the right it starts past the project towers so they stay in view.
      z = side === 1 ? -2 : street.zMin - 6;
      while (z < street.zMax + 20) {
        const depth = r.range(10, 20);
        const x0 = side * r.range(27, 30);
        this.#add(x0, x0 + side * r.range(10, 22), z, z + depth, r.range(28, 78), { side });
        z += depth + r.range(1, 5);
      }
    }

    // The name building at the end of the street (exterior shell of the AI hall)
    // No aircraft light: the rooftop scene has its own beacons
    this.dsBuilding = this.#add(ds.xMin, ds.xMax, ds.zBack, ds.zFront, ds.height, { floor: 4, col: 2.4, lit: 0.22, beacon: false });

    // Towers framing the name building. On the right, the three project skyscrapers
    // (chapter 3) take the front slots; the world/ProjectTowers module adds their hoardings.
    this.#add(-18, -30, -30, -46, r.range(54, 72));
    this.#add(-18, -34, -48, -70, r.range(70, 96));
    this.#add(-34, -52, -32, -60, r.range(40, 64));
    for (const t of LAYOUT.projects.towers) {
      const rotY = projectTowerYaw(t);
      this.#add(t.x - t.w / 2, t.x + t.w / 2, t.z - t.d / 2, t.z + t.d / 2, t.h, { floor: 3.2, col: 1.4, lit: 0.24, rotY });
    }
    this.#add(17, 28, -56, -76, r.range(84, 100));
    for (let i = 0; i < 6; i++) {
      const x0 = -48 + i * 17;
      this.#add(x0, x0 + r.range(10, 15), -74, -92, r.range(50, 110));
    }

    // Far end of the street (visible from the rooftop)
    for (let i = 0; i < 7; i++) {
      const x0 = -60 + i * 18;
      const h = i === 3 ? 74 : r.range(36, 90);
      const b = this.#add(x0, x0 + r.range(12, 16), 100, 116, h);
      if (i === 3) this.billboardTower = b;
    }

    // Distant skyline ring
    const ring = quality === 'low' ? 70 : 120;
    for (let i = 0; i < ring; i++) {
      const a = (i / ring) * Math.PI * 2 + r.range(-0.02, 0.02);
      const dist = r.range(135, 260);
      const cx = Math.cos(a) * dist;
      const cz = Math.sin(a) * dist + 10;
      const w = r.range(14, 30);
      const d = r.range(14, 30);
      this.#add(cx - w / 2, cx + w / 2, cz - d / 2, cz + d / 2, r.range(40, 150), { lit: r.range(0.2, 0.5) });
    }
  }

  #createBuildingMesh() {
    const count = this.buildings.length;
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const sizes = new Float32Array(count * 3);
    const data = new Float32Array(count * 4);
    const mesh = new THREE.InstancedMesh(geometry, this.buildingMaterial, count);
    const m = new THREE.Matrix4();
    const scale = new THREE.Vector3();
    this.buildings.forEach((b, i) => {
      m.makeRotationY(b.rotY);
      m.scale(scale.set(b.w, b.h, b.d));
      m.setPosition(b.x, b.y0 + b.h / 2, b.z);
      mesh.setMatrixAt(i, m);
      sizes.set([b.w, b.h, b.d], i * 3);
      data.set([b.seed, b.floor, b.col, b.lit], i * 4);
    });
    geometry.setAttribute('aSize', new THREE.InstancedBufferAttribute(sizes, 3));
    geometry.setAttribute('aData', new THREE.InstancedBufferAttribute(data, 4));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.frustumCulled = false;
    mesh.name = 'Buildings';
    this.group.add(mesh);
    this.buildingMesh = mesh;
  }

  #createNeonStrips() {
    const r = this.rng;
    const colors = [PALETTE.pink, PALETTE.cyan, PALETTE.violet, PALETTE.red, PALETTE.pink];
    const strips = [];
    for (const b of this.buildings) {
      if (!b.side || b.y0 > 0) continue;
      const faceX = b.side < 0 ? b.x + b.w / 2 : b.x - b.w / 2; // street-facing facade
      if (Math.abs(faceX) > 10) continue;
      const color = r.pick(colors);
      // Vertical corner tube
      if (r.chance(0.55)) {
        const z = r.chance(0.5) ? b.z - b.d / 2 + 0.25 : b.z + b.d / 2 - 0.25;
        const top = b.h * r.range(0.6, 0.95);
        if (top > 12) strips.push({ p: [faceX - b.side * 0.06, (top + 8) / 2, z], s: [0.12, top - 8, 0.12], color });
      }
      // Horizontal band at a random floor
      if (r.chance(0.6)) {
        const y = r.range(6, Math.max(7, b.h - 2));
        strips.push({ p: [faceX - b.side * 0.06, y, b.z], s: [0.1, 0.12, b.d * r.range(0.5, 0.95)], color: r.pick(colors) });
      }
      // Roofline
      if (r.chance(0.5)) strips.push({ p: [faceX - b.side * 0.06, b.h - 0.2, b.z], s: [0.12, 0.12, b.d], color: r.pick(colors) });
    }
    // Name building: outline the facade
    const { ds } = LAYOUT;
    const fz = ds.zFront + 0.08;
    strips.push({ p: [0, ds.height - 0.4, fz], s: [ds.xMax - ds.xMin, 0.16, 0.12], color: PALETTE.violet });
    strips.push({ p: [ds.xMin + 0.2, ds.height / 2, fz], s: [0.16, ds.height, 0.12], color: PALETTE.violet });
    strips.push({ p: [ds.xMax - 0.2, ds.height / 2, fz], s: [0.16, ds.height, 0.12], color: PALETTE.violet });

    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 1.5, 1.5) });
    const mesh = new THREE.InstancedMesh(geometry, material, strips.length);
    const m = new THREE.Matrix4();
    const c = new THREE.Color();
    strips.forEach((s, i) => {
      m.makeScale(...s.s);
      m.setPosition(...s.p);
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, c.set(s.color));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.frustumCulled = false;
    mesh.name = 'NeonStrips';
    this.group.add(mesh);
  }

  #createSigns() {
    const r = this.rng;
    const { texture, rects } = signAtlasTexture(11);
    const vertical = rects.filter((x) => x.vertical);
    const horizontal = rects.filter((x) => !x.vertical);
    const signs = [];
    const { billboard, store } = LAYOUT;

    for (const sideKey of ['left', 'right']) {
      const side = sideKey === 'left' ? -1 : 1;
      for (const b of this.facadeSpots[sideKey]) {
        const faceX = side * LAYOUT.street.halfWalk;
        const nearBillboard = side === billboard.side && b.z > billboard.position.z - 7 && b.z < billboard.position.z + 7;
        // Blade signs that stick out over the sidewalk
        const blades = r.int(1, 2);
        for (let k = 0; k < blades; k++) {
          const rect = r.pick(vertical);
          const h = r.range(3.6, 6.5);
          const y = r.range(5.5, Math.max(6, Math.min(b.h - h / 2 - 1, 18)));
          const z = b.z + r.range(-b.d * 0.35, b.d * 0.35);
          // Keep blades out of the billboard's sight line, including ones from neighbouring blocks
          const inBillboardView = side === billboard.side && z > billboard.position.z - 6 && z < billboard.position.z + 10;
          if ((nearBillboard || inBillboardView) && y > 6) continue;
          signs.push({
            rect,
            pos: [faceX - side * (h * rect.aspect * 0.5 + 0.15), y, z],
            rotY: 0,
            w: h * rect.aspect,
            h,
          });
        }
        // Flat signs on the facade above shopfronts
        if (r.chance(0.75) && !nearBillboard) {
          const rect = r.pick(horizontal);
          const h = r.range(1.1, 1.8);
          const w = Math.min(h * rect.aspect, b.d * 0.8);
          const hh = w / rect.aspect;
          signs.push({ rect, pos: [faceX - side * 0.05, r.range(4.6, 8.5), b.z], rotY: side < 0 ? Math.PI / 2 : -Math.PI / 2, w, h: hh });
        }
      }
    }
    // Keep signs out of the store front
    const filtered = signs.filter((s) => !(s.pos[0] > 6 && s.pos[2] > store.zMin - 2 && s.pos[2] < store.zMax + 2 && s.pos[1] < 9));

    const geometry = new THREE.PlaneGeometry(1, 1);
    const count = filtered.length;
    const rectAttr = new Float32Array(count * 4);
    const params = new Float32Array(count * 2);
    const material = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        { uAtlas: { value: null }, uTime: { value: 0 }, uIntensity: { value: 0.72 } },
      ]),
      vertexShader: signVertex,
      fragmentShader: signFragment,
      side: THREE.DoubleSide,
      fog: true,
    });
    material.uniforms.uAtlas.value = texture;
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    const obj = new THREE.Object3D();
    filtered.forEach((s, i) => {
      obj.position.set(...s.pos);
      obj.rotation.set(0, s.rotY, 0);
      obj.scale.set(s.w, s.h, 1);
      obj.updateMatrix();
      mesh.setMatrixAt(i, obj.matrix);
      rectAttr.set([s.rect.u, s.rect.v, s.rect.w, s.rect.h], i * 4);
      params.set([r.next(), r.range(0.75, 1.15)], i * 2);
    });
    geometry.setAttribute('aRect', new THREE.InstancedBufferAttribute(rectAttr, 4));
    geometry.setAttribute('aParams', new THREE.InstancedBufferAttribute(params, 2));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = false;
    mesh.name = 'Signs';
    this.group.add(mesh);
    this.signMaterial = material;
  }

  #createAircraftLights() {
    const positions = [];
    const phases = [];
    for (const b of this.tallRoofs) {
      positions.push(b.x, b.y0 + b.h + 0.6, b.z);
      phases.push(this.rng.next());
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('aPhase', new THREE.Float32BufferAttribute(phases, 1));
    const material = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uPixelRatio: { value: 1 } },
      vertexShader: /* glsl */ `
        attribute float aPhase;
        uniform float uTime;
        uniform float uPixelRatio;
        varying float vOn;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vOn = smoothstep(0.55, 0.75, fract(uTime * 0.45 + aPhase)) * (1.0 - smoothstep(0.85, 1.0, fract(uTime * 0.45 + aPhase)));
          gl_PointSize = clamp(260.0 / -mv.z, 2.0, 12.0) * uPixelRatio;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        varying float vOn;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.0, d);
          gl_FragColor = vec4(vec3(3.0, 0.25, 0.2) * a * (0.15 + vOn), 1.0);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    this.aircraftMaterial = material;
    this.group.add(points);
  }

  setPixelRatio(pr) {
    this.aircraftMaterial.uniforms.uPixelRatio.value = pr;
  }

  update(time) {
    this.buildingMaterial.uniforms.uTime.value = time;
    this.signMaterial.uniforms.uTime.value = time;
    this.aircraftMaterial.uniforms.uTime.value = time;
  }
}
