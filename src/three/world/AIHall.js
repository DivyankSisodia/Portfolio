import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LAYOUT } from '../layout.js';
import { createHoloMaterial } from '../materials.js';
import { codeTexture, documentTexture, ledRackTexture, makeCanvas, toTexture } from '../textures.js';
import { band, createRandom, PALETTE, smoothstep } from '../utils.js';

const { ds, hall } = LAYOUT;
const CORE = hall.core;

const DOC_SPOTS = [
  [-4.4, 3.0, -32],
  [3.4, 4.6, -35],
  [-4.6, 6.2, -38],
  [4.2, 2.6, -39.5],
  [-2.8, 2.2, -42],
  [5.2, 6.8, -43],
  [-5.4, 4.0, -45.5],
  [4.2, 9.0, -47],
  [-3.6, 8.8, -49],
  [5.6, 3.6, -49.5],
  [-6.2, 7.0, -52],
  [4.6, 11.0, -54],
];

const wallVertex = /* glsl */ `
  #include <common>
  #include <fog_pars_vertex>
  varying vec3 vWorld;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vec4 mvPosition = viewMatrix * world;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const wallFragment = /* glsl */ `
  #include <common>
  #include <fog_pars_fragment>
  uniform vec3 uCore;
  uniform vec3 uCoreColor;
  uniform vec3 uRed;
  uniform vec3 uRedColor;
  uniform float uPulse;
  varying vec3 vWorld;
  void main() {
    float along = vWorld.x + vWorld.z;
    float seamX = smoothstep(0.04, 0.0, abs(fract(along / 3.2) - 0.5) - 0.46);
    float seamY = smoothstep(0.04, 0.0, abs(fract(vWorld.y / 2.6) - 0.5) - 0.46);
    vec3 col = vec3(0.010, 0.011, 0.018) * (1.0 - 0.45 * max(seamX, seamY));
    float dc = distance(vWorld, uCore);
    col += uCoreColor * (0.55 + 0.25 * uPulse) / (1.0 + dc * dc * 0.012);
    float dr = distance(vWorld, uRed);
    col += uRedColor * 0.6 / (1.0 + dr * dr * 0.03);
    // Darker toward the roof
    col *= mix(1.0, 0.35, smoothstep(10.0, 40.0, vWorld.y));
    // Dashed light lines at each floor of the shaft, so the rise reads as motion
    float level = vWorld.y / 4.4;
    float dy = abs(fract(level + 0.5) - 0.5) * 4.4;
    float dash = step(0.32, fract(along / 2.8 + floor(level + 0.5) * 0.37));
    float shaft = smoothstep(14.0, 17.0, vWorld.y) * (1.0 - smoothstep(40.0, 43.0, vWorld.y));
    float lines = exp(-dy * dy * 90.0) * dash * shaft;
    float redLevel = step(0.8, fract(floor(level + 0.5) * 0.618));
    col += mix(uCoreColor * 3.0, uRedColor * 2.6, redLevel) * lines;
    gl_FragColor = vec4(col, 1.0);
    #include <fog_fragment>
  }
`;

export class AIHall {
  constructor({ quality }) {
    this.group = new THREE.Group();
    this.group.name = 'AIHall';
    this.interior = new THREE.Group();
    this.group.add(this.interior);
    this.rng = createRandom(1234);
    this.quality = quality;

    this.#createWalls();
    this.#createStructure();
    this.#createRacks();
    this.#createDesk();
    this.#createDocuments();
    this.#createStreams(quality === 'low' ? 2400 : 5200);
    this.#createCore();
    this.#createBeam();
  }

  #createWalls() {
    this.wallMaterial = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        {
          uCore: { value: CORE.clone() },
          uCoreColor: { value: new THREE.Color('#2fd8ff').multiplyScalar(0.12) },
          uRed: { value: new THREE.Vector3(-13, 2.5, -37) },
          uRedColor: { value: new THREE.Color(PALETTE.red).multiplyScalar(0.12) },
          uPulse: { value: 0 },
        },
      ]),
      vertexShader: wallVertex,
      fragmentShader: wallFragment,
      fog: true,
    });
    const inset = 0.4;
    const x0 = ds.xMin + inset;
    const x1 = ds.xMax - inset;
    const z0 = ds.zBack + inset;
    const z1 = ds.zFront - inset;
    const h = ds.height;
    const depth = z1 - z0;
    const width = x1 - x0;
    const cz = (z0 + z1) / 2;
    const add = (w, pos, rotY) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), this.wallMaterial);
      m.position.set(pos[0], h / 2, pos[1]);
      m.rotation.y = rotY;
      this.interior.add(m);
    };
    add(depth, [x0, cz], Math.PI / 2);
    add(depth, [x1, cz], -Math.PI / 2);
    add(width, [0, z0], 0);
    add(width, [0, z1], Math.PI);
  }

  #createStructure() {
    const geos = [];
    const box = (sx, sy, sz, x, y, z) => geos.push(new THREE.BoxGeometry(sx, sy, sz).translate(x, y, z));
    const pipe = (r, len, x, y, z, axis) => {
      const g = new THREE.CylinderGeometry(r, r, len, 10);
      if (axis === 'z') g.rotateX(Math.PI / 2);
      if (axis === 'x') g.rotateZ(Math.PI / 2);
      geos.push(g.translate(x, y, z));
    };
    // Ceiling grid over the front half; the back half stays open as an atrium
    for (let z = -31; z >= -47; z -= 4) box(31, 0.5, 0.45, 0, 12.6, z);
    for (const x of [-9, -3, 3, 9]) box(0.4, 0.4, 17, x, 12.9, -39);
    // Pipes along the walls
    for (const side of [-1, 1]) {
      pipe(0.18, 41, side * 15.1, 9.4, -49, 'z');
      pipe(0.12, 41, side * 15.1, 10.0, -49, 'z');
      pipe(0.28, 41, side * 14.9, 11.2, -49, 'z');
      for (let z = -32; z > -68; z -= 7) pipe(0.14, 11, side * 15.2, 5.5, z, 'y');
    }
    // Catwalk ring around the atrium
    box(30, 0.15, 1.2, 0, 18, -50.6);
    box(30, 0.15, 1.2, 0, 18, -68.6);
    box(1.2, 0.15, 18, -14.6, 18, -59.6);
    box(1.2, 0.15, 18, 14.6, 18, -59.6);
    const mesh = new THREE.Mesh(
      mergeGeometries(geos),
      new THREE.MeshStandardMaterial({ color: '#0a0b10', roughness: 0.5, metalness: 0.8, envMapIntensity: 0.5 }),
    );
    geos.forEach((g) => g.dispose());
    this.interior.add(mesh);

    // Red floor strips along the walls and a cyan line toward the core
    const red = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.red).multiplyScalar(3) });
    const cyan = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.cyan).multiplyScalar(2.4) });
    for (const side of [-1, 1]) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.04, 40), red);
      s.position.set(side * 14.6, 0.03, -49);
      this.interior.add(s);
    }
    const lane = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 22), cyan);
    lane.position.set(0, 0.03, -41);
    this.interior.add(lane);
    // Pools of light on the floor (additive decals)
    this.interior.add(floorGlow(CORE.x, CORE.z, 10, new THREE.Color(PALETTE.cyan).multiplyScalar(0.35)));
    this.interior.add(floorGlow(-12, -37, 9, new THREE.Color(PALETTE.red).multiplyScalar(0.3)));
  }

  #createRacks() {
    const count = 8;
    const geo = new THREE.BoxGeometry(1.0, 2.6, 1.2);
    const bodies = new THREE.InstancedMesh(
      geo,
      new THREE.MeshStandardMaterial({ color: '#07080c', roughness: 0.4, metalness: 0.7, envMapIntensity: 0.6 }),
      count,
    );
    this.ledTexture = ledRackTexture(9);
    this.ledTexture.wrapT = THREE.RepeatWrapping;
    this.ledMaterial = new THREE.MeshBasicMaterial({ map: this.ledTexture, color: new THREE.Color(1.6, 1.6, 1.6) });
    const faces = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.1, 2.4), this.ledMaterial, count);
    const o = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
      const z = -33 - i * 1.35 - (i > 3 ? 3 : 0);
      o.position.set(-14.4, 1.3, z);
      o.rotation.set(0, 0, 0);
      o.updateMatrix();
      bodies.setMatrixAt(i, o.matrix);
      o.position.set(-13.89, 1.3, z);
      o.rotation.set(0, Math.PI / 2, 0);
      o.updateMatrix();
      faces.setMatrixAt(i, o.matrix);
    }
    this.interior.add(bodies, faces);
  }

  #createDesk() {
    const desk = new THREE.Group();
    const metal = new THREE.MeshStandardMaterial({ color: '#0c0d12', roughness: 0.35, metalness: 0.8, envMapIntensity: 0.8 });
    const top = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.06, 1.0), metal);
    top.position.y = 0.76;
    desk.add(top);
    for (const [x, z] of [
      [-1.2, -0.4],
      [1.2, -0.4],
      [-1.2, 0.4],
      [1.2, 0.4],
    ]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.76, 0.05), metal);
      leg.position.set(x, 0.38, z);
      desk.add(leg);
    }
    const screen = new THREE.MeshBasicMaterial({ map: codeTexture(), color: new THREE.Color(1.5, 1.5, 1.6) });
    for (const [x, ry] of [
      [-0.62, 0.18],
      [0.62, -0.18],
    ]) {
      const mon = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.68, 0.04), metal);
      mon.add(body);
      const face = new THREE.Mesh(new THREE.PlaneGeometry(1.06, 0.62), screen);
      face.position.z = 0.021;
      mon.add(face);
      const stand = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.3, 0.05), metal);
      stand.position.y = -0.45;
      mon.add(stand);
      mon.position.set(x, 1.24, -0.2);
      mon.rotation.y = ry;
      desk.add(mon);
    }
    const keyboard = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.025, 0.25), metal);
    keyboard.position.set(0, 0.8, 0.2);
    desk.add(keyboard);
    // Chair
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.08, 0.55), metal);
    seat.position.set(0.1, 0.5, 0.95);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.7, 0.06), metal);
    back.position.set(0.1, 0.9, 1.22);
    back.rotation.x = -0.12;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.45, 8), metal);
    pole.position.set(0.1, 0.25, 0.95);
    desk.add(seat, back, pole);
    // Monitor glow on the floor and desk
    desk.add(floorGlow(0, -0.4, 3.5, new THREE.Color('#62e6ff').multiplyScalar(0.18)));
    const lamp = new THREE.PointLight('#62e6ff', 4, 6, 1.6);
    lamp.position.set(0, 1.5, 0.6);
    desk.add(lamp);

    desk.position.set(8.2, 0, -41.5);
    desk.rotation.y = -0.75;
    this.interior.add(desk);

    const red = new THREE.PointLight(PALETTE.red, 10, 16, 1.6);
    red.position.set(-12, 3, -37);
    this.interior.add(red);
  }

  #createDocuments() {
    this.docs = [];
    const textures = Array.from({ length: 6 }, (_, i) => documentTexture(i));
    DOC_SPOTS.forEach((p, i) => {
      const material = createHoloMaterial({ map: textures[i % textures.length], color: '#8ff0ff', intensity: 1.1, scan: 1 });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.875), material);
      mesh.position.set(...p);
      mesh.lookAt(p[0] * 0.3, p[1], p[2] + 9);
      this.interior.add(mesh);
      this.docs.push({ mesh, material, base: new THREE.Vector3(...p), phase: this.rng.next() * 6.28, rot: mesh.rotation.y });
    });
  }

  #createStreams(count) {
    const r = this.rng;
    const curves = [];
    for (const d of DOC_SPOTS) {
      const a = new THREE.Vector3(...d);
      const pts = [a];
      for (const f of [0.3, 0.62]) {
        pts.push(a.clone().lerp(CORE, f).add(new THREE.Vector3(r.range(-2.2, 2.2), r.range(-1.6, 1.6), r.range(-1, 1))));
      }
      pts.push(CORE.clone());
      curves.push(new THREE.CatmullRomCurve3(pts, false, 'centripetal'));
    }
    // Long query streams that come in from the door and weave along the floor
    for (let k = 0; k < 4; k++) {
      const x = (k - 1.5) * 2.6;
      curves.push(
        new THREE.CatmullRomCurve3(
          [
            new THREE.Vector3(x, 0.6 + k * 0.3, -29),
            new THREE.Vector3(x * 1.6 + r.range(-1, 1), 1.6 + r.range(0, 1.5), -37),
            new THREE.Vector3(x * 0.8 + r.range(-1, 1), 3 + r.range(0, 2), -46),
            new THREE.Vector3(x * 0.4, 5 + r.range(0, 1.5), -53),
            CORE.clone(),
          ],
          false,
          'centripetal',
        ),
      );
    }

    const S = 140;
    this.streamSamples = curves.map((c) => {
      const pts = c.getSpacedPoints(S - 1);
      const frames = c.computeFrenetFrames(S - 1, false);
      const arr = new Float32Array(S * 9);
      for (let i = 0; i < S; i++) {
        arr.set([pts[i].x, pts[i].y, pts[i].z], i * 9);
        arr.set([frames.normals[i].x, frames.normals[i].y, frames.normals[i].z], i * 9 + 3);
        arr.set([frames.binormals[i].x, frames.binormals[i].y, frames.binormals[i].z], i * 9 + 6);
      }
      return arr;
    });
    this.S = S;

    // Faint guide lines along each stream
    const linePos = [];
    curves.forEach((c) => {
      const pts = c.getSpacedPoints(80);
      for (let i = 0; i < pts.length - 1; i++) linePos.push(pts[i].x, pts[i].y, pts[i].z, pts[i + 1].x, pts[i + 1].y, pts[i + 1].z);
    });
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(linePos, 3));
    const lines = new THREE.LineSegments(
      lineGeo,
      new THREE.LineBasicMaterial({
        color: new THREE.Color(PALETTE.cyan).multiplyScalar(0.35),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.interior.add(lines);

    // Particles
    this.particles = {
      count,
      curve: new Uint8Array(count),
      offset: new Float32Array(count),
      speed: new Float32Array(count),
      radius: new Float32Array(count),
      angle: new Float32Array(count),
      spin: new Float32Array(count),
    };
    const P = this.particles;
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const cyan = new THREE.Color('#47eaff');
    const white = new THREE.Color('#e8fbff');
    const magenta = new THREE.Color('#ff4fd8');
    for (let i = 0; i < count; i++) {
      P.curve[i] = i % curves.length;
      P.offset[i] = r.next();
      P.speed[i] = r.range(0.05, 0.11);
      P.radius[i] = Math.pow(r.next(), 1.8) * 0.45;
      P.angle[i] = r.next() * Math.PI * 2;
      P.spin[i] = r.range(-1.6, 1.6);
      const c = r.chance(0.12) ? magenta : r.chance(0.12) ? white : cyan;
      colors.set([c.r, c.g, c.b], i * 3);
      sizes[i] = r.range(0.5, 1.4);
    }
    const geo = new THREE.BufferGeometry();
    this.streamPositions = new Float32Array(count * 3);
    this.streamBright = new Float32Array(count);
    geo.setAttribute('position', new THREE.BufferAttribute(this.streamPositions, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aBright', new THREE.BufferAttribute(this.streamBright, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    this.streamMaterial = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uPixelRatio: { value: 1 } }]),
      vertexShader: /* glsl */ `
        #include <common>
        #include <fog_pars_vertex>
        attribute float aBright;
        attribute float aSize;
        attribute vec3 aColor;
        uniform float uPixelRatio;
        varying vec3 vColor;
        void main() {
          vColor = aColor * aBright;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = clamp(aSize * (0.6 + aBright * 0.4) * uPixelRatio * (70.0 / -mvPosition.z), 1.0, 40.0);
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }
      `,
      fragmentShader: /* glsl */ `
        #include <common>
        #include <fog_pars_fragment>
        varying vec3 vColor;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.0, d);
          float fogFactor = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
          gl_FragColor = vec4(vColor * a * (1.0 - fogFactor), 1.0);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: true,
    });
    const points = new THREE.Points(geo, this.streamMaterial);
    points.frustumCulled = false;
    this.interior.add(points);
    this.streamGeometry = geo;
    this.pulses = curves.map(() => r.next());
  }

  #createCore() {
    const core = new THREE.Group();
    core.position.copy(CORE);
    const heart = new THREE.Mesh(new THREE.SphereGeometry(0.62, 32, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 4.6, 5.2) }));
    core.add(heart);
    const lattice = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(1.55, 1)),
      new THREE.LineBasicMaterial({ color: new THREE.Color(1.2, 3.4, 4), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    core.add(lattice);
    const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.4, 3.6, 4.4) });
    const ringA = new THREE.Mesh(new THREE.TorusGeometry(2.3, 0.022, 8, 160), ringMat);
    const ringB = new THREE.Mesh(new THREE.TorusGeometry(2.8, 0.018, 8, 160), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 0.8, 3.2) }));
    ringA.rotation.x = Math.PI / 2.4;
    ringB.rotation.y = Math.PI / 3;
    core.add(ringA, ringB);
    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: radialTexture(), color: new THREE.Color('#5fe9ff').multiplyScalar(1.4), blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    glow.scale.setScalar(9);
    core.add(glow);
    const light = new THREE.PointLight('#4fe3ff', 40, 34, 1.4);
    core.add(light);
    this.core = { group: core, lattice, ringA, ringB, heart, glow };
    this.interior.add(core);
  }

  #createBeam() {
    this.beamMaterial = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color('#5fe9ff') }, uStrength: { value: 1 } },
      vertexShader: /* glsl */ `
        varying vec2 vUv; varying float vDepth;
        void main(){
          vUv = uv;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vDepth = -mv.z;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform vec3 uColor; uniform float uStrength; varying vec2 vUv; varying float vDepth;
        void main(){
          float base = 1.0 - smoothstep(0.0, 1.0, vUv.y);
          float streaks = 0.6 + 0.4 * sin(vUv.x * 40.0 + vUv.y * 12.0 - uTime * 3.0);
          float pulse = 0.7 + 0.3 * sin(vUv.y * 60.0 - uTime * 5.0);
          float a = (0.12 + base * 0.9) * streaks * pulse * smoothstep(0.0, 0.02, vUv.y);
          // Fade the part right next to the camera so the rise does not blow out
          a *= smoothstep(1.0, 8.0, vDepth);
          gl_FragColor = vec4(uColor * a * 0.55 * uStrength, 1.0);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const height = 150;
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, height, 32, 1, true), this.beamMaterial);
    beam.position.set(CORE.x, CORE.y + height / 2, CORE.z);
    this.group.add(beam);

    // Answer particles spiralling up the beam
    const count = this.quality === 'low' ? 300 : 700;
    const seeds = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) seeds.set([this.rng.next(), this.rng.next(), this.rng.next()], i * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(seeds, 3));
    this.riseMaterial = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uPixelRatio: { value: 1 }, uOrigin: { value: CORE.clone() } },
      vertexShader: /* glsl */ `
        uniform float uTime; uniform float uPixelRatio; uniform vec3 uOrigin; varying float vA;
        void main(){
          float h = mod(position.x * 70.0 + uTime * (3.0 + position.y * 4.0), 70.0);
          float ang = position.z * 6.2831 + uTime * 0.6 + h * 0.12;
          float rad = 1.1 + 0.6 * sin(position.y * 20.0 + uTime);
          vec3 p = uOrigin + vec3(cos(ang) * rad, h, sin(ang) * rad);
          vA = smoothstep(0.0, 4.0, h) * smoothstep(70.0, 50.0, h);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = clamp(2.2 * uPixelRatio * (40.0 / -mv.z), 1.0, 18.0);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        varying float vA;
        void main(){ float d = length(gl_PointCoord - 0.5); gl_FragColor = vec4(vec3(0.6, 1.6, 2.0) * smoothstep(0.5, 0.0, d) * vA, 1.0); }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const rise = new THREE.Points(geo, this.riseMaterial);
    rise.frustumCulled = false;
    this.group.add(rise);
  }

  setPixelRatio(pr) {
    this.streamMaterial.uniforms.uPixelRatio.value = pr;
    this.riseMaterial.uniforms.uPixelRatio.value = pr;
  }

  update(time, dt, s) {
    this.beamMaterial.uniforms.uTime.value = time;
    this.beamMaterial.uniforms.uStrength.value = 0.6 + 0.3 * band(s, 2.4, 2.6, 2.9, 3.05);
    this.riseMaterial.uniforms.uTime.value = time;

    const inside = s > 2.45 && s < 3.08;
    this.interior.visible = inside;
    if (!inside) return;

    const pulse = 0.5 + 0.5 * Math.sin(time * 2.1);
    this.wallMaterial.uniforms.uPulse.value = pulse;
    this.ledTexture.offset.y = Math.floor(time * 3) * 0.013;

    // Core spins faster as the camera arrives
    const energy = 1 + 1.5 * smoothstep(2.6, 2.78, s);
    const c = this.core;
    c.lattice.rotation.y += dt * 0.35 * energy;
    c.lattice.rotation.x += dt * 0.12 * energy;
    c.ringA.rotation.z += dt * 0.6 * energy;
    c.ringB.rotation.x += dt * 0.45 * energy;
    c.heart.scale.setScalar(1 + pulse * 0.08);
    c.glow.scale.setScalar(8.5 + pulse * 1.2);

    // Documents bob and get "read" as the camera passes
    const reveal = smoothstep(2.58, 2.74, s);
    this.docs.forEach((d, i) => {
      d.mesh.position.y = d.base.y + Math.sin(time * 0.7 + d.phase) * 0.14;
      d.mesh.rotation.y = d.rot + Math.sin(time * 0.35 + d.phase) * 0.06;
      d.material.uniforms.uTime.value = time;
      d.material.uniforms.uReveal.value = smoothstep(i * 0.04, i * 0.04 + 0.5, reveal) * 1.06;
    });

    // Particles flow along their streams with a slow twist
    const P = this.particles;
    const S = this.S;
    const pos = this.streamPositions;
    const bright = this.streamBright;
    const pulses = this.pulses;
    for (let k = 0; k < pulses.length; k++) pulses[k] = (pulses[k] + dt * 0.22) % 1.4;
    for (let i = 0; i < P.count; i++) {
      const samples = this.streamSamples[P.curve[i]];
      const t = (P.offset[i] + time * P.speed[i]) % 1;
      const f = t * (S - 1);
      const i0 = Math.min(Math.floor(f), S - 2);
      const w = f - i0;
      const a = i0 * 9;
      const b = a + 9;
      const ang = P.angle[i] + time * P.spin[i];
      const rr = P.radius[i] * (0.4 + 0.6 * Math.sin(t * Math.PI));
      const ca = Math.cos(ang) * rr;
      const sa = Math.sin(ang) * rr;
      for (let k = 0; k < 3; k++) {
        const p = samples[a + k] + (samples[b + k] - samples[a + k]) * w;
        pos[i * 3 + k] = p + samples[a + 3 + k] * ca + samples[a + 6 + k] * sa;
      }
      const dp = t - pulses[P.curve[i]];
      bright[i] = 0.55 + 1.8 * Math.exp(-dp * dp * 260) + 0.6 * smoothstep(0.85, 1, t);
    }
    this.streamGeometry.attributes.position.needsUpdate = true;
    this.streamGeometry.attributes.aBright.needsUpdate = true;
  }
}

function floorGlow(x, z, size, color) {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.ShaderMaterial({
      uniforms: { uColor: { value: color } },
      vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `uniform vec3 uColor; varying vec2 vUv; void main(){ float d = length(vUv - 0.5) * 2.0; gl_FragColor = vec4(uColor * exp(-d * d * 3.5), 1.0); }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, 0.025, z);
  return mesh;
}

let radialCache = null;
function radialTexture() {
  if (radialCache) return radialCache;
  const { canvas, ctx } = makeCanvas(128, 128);
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  radialCache = toTexture(canvas);
  return radialCache;
}
