import * as THREE from 'three';
import { LAYOUT } from '../layout.js';
import { createHoloMaterial, createNeonMaterial, Flicker } from '../materials.js';
import { billboardTexture, neonWordTexture } from '../textures.js';
import { createRandom, GLSL_NOISE, band, PALETTE } from '../utils.js';

const { ds, billboard } = LAYOUT;

/** Name sign, portal door, holo billboards and drifting ground mist. */
export class Street {
  constructor({ city, quality }) {
    this.group = new THREE.Group();
    this.group.name = 'Street';
    this.#createNameSign();
    this.#createPortal();
    this.#createBillboards(city);
    this.#createMist(quality);
  }

  #createNameSign() {
    const z = ds.zFront + 0.12;
    const lines = [
      { word: 'DIVYANK', y: 25.6 },
      { word: 'SISODIA', y: 19.4 },
    ];
    this.signFlickers = [];
    this.signMaterials = [];
    for (const { word, y } of lines) {
      // Wider canvas than the letters need, so the glow never reaches the edge and gets clipped
      const map = neonWordTexture(word, { color: '#b98aff', width: 2816, height: 480, size: 250, spacing: 0.16 });
      const material = createNeonMaterial({ map, color: '#c9b4ff', intensity: 1.15, fogStrength: 0.45 });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(29, 29 * (480 / 2816)), material);
      mesh.position.set(0, y, z);
      this.group.add(mesh);
      this.signMaterials.push(material);
      this.signFlickers.push(new Flicker({ min: 6, max: 14, depth: 0.8 }));
    }
    // Soft wash of light on the facade around the sign
    const wash = new THREE.Mesh(
      new THREE.PlaneGeometry(30, 16),
      new THREE.ShaderMaterial({
        uniforms: { uColor: { value: new THREE.Color('#7d48ff').multiplyScalar(0.22) } },
        vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: /* glsl */ `
          uniform vec3 uColor; varying vec2 vUv;
          void main(){ vec2 d = (vUv - 0.5) * vec2(1.6, 2.2); float a = exp(-dot(d, d) * 2.2); gl_FragColor = vec4(uColor * a, 1.0); }
        `,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    wash.position.set(0, 23.4, ds.zFront + 0.06);
    this.group.add(wash);
  }

  #createPortal() {
    const { halfWidth, height } = ds.door;
    const z = ds.zFront + 0.1;
    this.portalMaterial = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uIntensity: { value: 1 } },
      vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform float uIntensity;
        varying vec2 vUv;
        ${GLSL_NOISE}
        void main() {
          float cx = abs(vUv.x - 0.5) * 2.0;
          float core = exp(-cx * cx * 2.2) * (0.55 + 0.45 * (1.0 - vUv.y));
          float n = fbm(vec2(vUv.x * 3.0, vUv.y * 2.0 - uTime * 0.25));
          float edge = smoothstep(0.0, 0.05, vUv.x) * smoothstep(1.0, 0.95, vUv.x) * smoothstep(1.0, 0.94, vUv.y);
          vec3 deep = vec3(1.0, 0.06, 0.14);
          vec3 hot = vec3(1.0, 0.62, 0.66);
          vec3 col = mix(deep, hot, core * core) * (0.18 + core * 0.75 + n * 0.25) * edge;
          gl_FragColor = vec4(col * uIntensity, 1.0);
        }
      `,
    });
    const door = new THREE.Mesh(new THREE.PlaneGeometry(halfWidth * 2, height), this.portalMaterial);
    door.position.set(0, height / 2, z);
    this.group.add(door);

    // Glowing frame
    const frameMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.red).multiplyScalar(2.6) });
    const t = 0.16;
    const parts = [
      [halfWidth * 2 + t * 2 + 0.6, t, 0, height + 0.35],
      [t, height + 0.35, -halfWidth - 0.3, (height + 0.35) / 2],
      [t, height + 0.35, halfWidth + 0.3, (height + 0.35) / 2],
    ];
    for (const [w, h, x, y] of parts) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.12), frameMat);
      m.position.set(x, y, z + 0.05);
      this.group.add(m);
    }
    // Light pool on the wet ground in front of the door
    const pool = new THREE.Mesh(
      new THREE.PlaneGeometry(16, 10),
      new THREE.ShaderMaterial({
        uniforms: { uColor: { value: new THREE.Color(PALETTE.red).multiplyScalar(0.45) } },
        vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: /* glsl */ `
          uniform vec3 uColor; varying vec2 vUv;
          void main(){ vec2 d = vec2((vUv.x - 0.5) * 1.6, (1.0 - vUv.y)); float a = exp(-dot(d, d) * 3.0); gl_FragColor = vec4(uColor * a, 1.0); }
        `,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(0, 0.02, ds.zFront + 5);
    this.group.add(pool);
  }

  #createBillboards(city) {
    const { texture, count } = billboardTexture();
    const material = createHoloMaterial({ map: texture, color: '#d9ccff', intensity: 0.8, slides: count, scan: 1 });
    this.billboardMaterial = material;
    this.slideCount = count;
    this.slideTimer = 0;
    this.slide = 0;
    this.glitch = 0;

    const add = (w, pos, rotY) => {
      const g = new THREE.Group();
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(w, w * (704 / 512)), material);
      g.add(screen);
      const frame = new THREE.Mesh(
        new THREE.BoxGeometry(w + 0.5, w * (704 / 512) + 0.5, 0.3),
        new THREE.MeshStandardMaterial({ color: '#06050a', roughness: 0.5, metalness: 0.6 }),
      );
      frame.position.z = -0.2;
      g.add(frame);
      g.position.copy(pos);
      g.rotation.y = rotY;
      this.group.add(g);
    };
    add(7, billboard.position, billboard.rotationY);
    const tower = city.billboardTower;
    if (tower) add(16, new THREE.Vector3(tower.x, 46, tower.z - tower.d / 2 - 0.4), Math.PI);
  }

  #createMist(quality) {
    const rng = createRandom(77);
    const count = quality === 'low' ? 26 : 44;
    const base = new THREE.PlaneGeometry(1, 1);
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.index = base.index;
    geometry.setAttribute('position', base.getAttribute('position'));
    geometry.setAttribute('uv', base.getAttribute('uv'));
    const centers = new Float32Array(count * 4);
    const colors = new Float32Array(count * 3);
    const palette = [new THREE.Color('#ff3d9a'), new THREE.Color('#9b5cff'), new THREE.Color('#3ff0ff'), new THREE.Color('#ff2e4d')];
    for (let i = 0; i < count; i++) {
      const nearDoor = i < 6;
      const x = nearDoor ? rng.range(-6, 6) : rng.range(-9, 9);
      const z = nearDoor ? rng.range(-27, -20) : rng.range(-24, 70);
      centers.set([x, rng.range(0.6, 2.4), z, rng.range(6, 13)], i * 4);
      const c = nearDoor ? palette[3] : rng.pick(palette);
      colors.set([c.r, c.g, c.b], i * 3);
    }
    geometry.setAttribute('aCenter', new THREE.InstancedBufferAttribute(centers, 4));
    geometry.setAttribute('aColor', new THREE.InstancedBufferAttribute(colors, 3));
    geometry.instanceCount = count;
    this.mistMaterial = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 }, uOpacity: { value: 1 } }]),
      vertexShader: /* glsl */ `
        #include <common>
        #include <fog_pars_vertex>
        attribute vec4 aCenter;
        attribute vec3 aColor;
        uniform float uTime;
        varying vec2 vUv;
        varying vec3 vColor;
        varying float vFade;
        varying float vSeed;
        void main() {
          vUv = uv;
          vColor = aColor;
          vSeed = aCenter.x * 0.37 + aCenter.z * 0.11;
          vec3 c = aCenter.xyz + vec3(sin(uTime * 0.05 + vSeed) * 2.0, 0.0, cos(uTime * 0.04 + vSeed) * 1.5);
          vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
          vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
          vec3 world = c + (right * position.x + up * position.y * 0.45) * aCenter.w;
          float d = distance(cameraPosition, c);
          vFade = smoothstep(2.0, 9.0, d);
          vec4 mvPosition = viewMatrix * vec4(world, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }
      `,
      fragmentShader: /* glsl */ `
        #include <common>
        #include <fog_pars_fragment>
        uniform float uTime;
        uniform float uOpacity;
        varying vec2 vUv;
        varying vec3 vColor;
        varying float vFade;
        varying float vSeed;
        ${GLSL_NOISE}
        void main() {
          vec2 d = vUv - 0.5;
          float r = length(d) * 2.0;
          float n = fbm(vUv * 3.0 + vec2(uTime * 0.03, vSeed));
          float a = smoothstep(1.0, 0.1, r) * (0.4 + n * 0.8);
          vec3 col = vColor * a * 0.035 * vFade * uOpacity;
          float fogFactor = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
          col *= 1.0 - fogFactor * 0.8;
          gl_FragColor = vec4(col, 1.0);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: true,
    });
    const mist = new THREE.Mesh(geometry, this.mistMaterial);
    mist.frustumCulled = false;
    mist.renderOrder = 4;
    mist.layers.set(1);
    this.group.add(mist);
  }

  update(time, dt, s) {
    this.signMaterials.forEach((m, i) => (m.uniforms.uFlicker.value = this.signFlickers[i].update(dt)));
    this.portalMaterial.uniforms.uTime.value = time;
    this.portalMaterial.uniforms.uIntensity.value = 1 + 1.6 * band(s, 2.4, 2.56, 2.6, 2.66);
    this.mistMaterial.uniforms.uTime.value = time;
    this.mistMaterial.uniforms.uOpacity.value = 1 - band(s, 2.58, 2.64, 2.9, 3.0) * 0.8;

    // Billboard: cycle slides with a short glitch at each switch
    const m = this.billboardMaterial.uniforms;
    m.uTime.value = time;
    this.slideTimer += dt;
    if (this.slideTimer > 3.6) {
      this.slideTimer = 0;
      this.glitch = 1;
      this.switched = false;
    }
    if (this.glitch > 0) {
      this.glitch = Math.max(0, this.glitch - dt * 3);
      if (!this.switched && this.glitch < 0.5) {
        this.slide = (this.slide + 1) % this.slideCount;
        this.switched = true;
      }
    }
    m.uSlide.value = this.slide;
    m.uGlitch.value = this.glitch;
  }
}
