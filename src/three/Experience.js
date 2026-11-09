import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { CameraRig } from './CameraRig.js';
import { band, clamp, damp, lerp, smoothstep } from './utils.js';
import { loadCanvasFonts, setMaxAnisotropy } from './textures.js';
import { createNeonEnvironment } from './materials.js';
import { City } from './world/City.js';
import { Ground } from './world/Ground.js';
import { Life } from './world/Life.js';
import { Rain } from './world/Rain.js';
import { SakuraTree } from './world/Sakura.js';
import { Sky } from './world/Sky.js';
import { Street } from './world/Street.js';
import { ParfameStore } from './world/ParfameStore.js';
import { AIHall } from './world/AIHall.js';
import { Rooftop } from './world/Rooftop.js';
import { ProjectTowers } from './world/ProjectTowers.js';

const FXShader = {
  name: 'FXShader',
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uAberration: { value: 0.0012 },
    uFlash: { value: 0 },
    uFlashColor: { value: new THREE.Vector3(1.0, 0.32, 0.42) },
    uGrain: { value: 0.045 },
    uVignette: { value: 1 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uAberration;
    uniform float uFlash;
    uniform vec3 uFlashColor;
    uniform float uGrain;
    uniform float uVignette;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 dir = vUv - 0.5;
      float d = length(dir);
      vec2 off = dir * uAberration * (0.5 + d * 2.5);
      vec3 col;
      col.r = texture2D(tDiffuse, vUv + off).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv - off).b;
      float vig = smoothstep(0.9, 0.3, d * uVignette);
      col *= mix(0.5, 1.0, vig);
      col = mix(col, uFlashColor, clamp(uFlash, 0.0, 1.0) * 0.92);
      float g = hash(vUv * vec2(1931.0, 1087.0) + fract(uTime * 7.3) * 113.0) - 0.5;
      col += g * uGrain;
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

export class Experience {
  constructor({ canvas, quality = 'high', reducedMotion = false }) {
    this.canvas = canvas;
    this.quality = quality;
    this.reducedMotion = reducedMotion;
    this.pieces = [];
    this.timer = new THREE.Timer();
    this.time = 0;
    this.scrollVelocity = 0;
    this.maxPixelRatio = Math.min(window.devicePixelRatio || 1, quality === 'low' ? 1.25 : 1.6);
    this.pixelRatio = this.maxPixelRatio;
    this.minPixelRatio = 0.65;
    this.frameTimes = [];
    this.adaptTimer = 0;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    setMaxAnisotropy(this.renderer.capabilities.getMaxAnisotropy());

    this.scene = new THREE.Scene();
    this.fogColor = new THREE.Color('#120a20');
    this.scene.fog = new THREE.FogExp2(this.fogColor.clone(), 0.012);
    this.scene.background = this.fogColor.clone();

    this.camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.camera.layers.enable(1);
    this.rig = new CameraRig(this.camera, { reducedMotion });
  }

  /** Builds the world in steps so the loader can show progress. */
  async init(onProgress = () => {}) {
    const step = async (label, fraction, fn) => {
      onProgress(fraction, label);
      await new Promise((r) => requestAnimationFrame(() => r()));
      fn();
    };

    await loadCanvasFonts();
    await step('Raising the skyline', 0.15, () => {
      this.scene.environment = createNeonEnvironment(this.renderer);
      this.scene.add(new THREE.HemisphereLight('#3a2a66', '#120814', 0.6));
      this.sky = new Sky({ fogColor: this.fogColor });
      this.scene.add(this.sky.mesh);
      this.city = new City({ quality: this.quality });
      this.scene.add(this.city.group);
    });
    await step('Switching on the signs', 0.28, () => {
      this.addPiece(new Street({ city: this.city, quality: this.quality }));
      const blossoms = this.quality === 'low' ? 1200 : 2200;
      this.addPiece(new SakuraTree({ position: new THREE.Vector3(-7.2, 0, 37), scale: 1.2, seed: 3, blossoms }));
      this.addPiece(new Life({ quality: this.quality }));
    });
    await step('Polishing the glass', 0.45, () => {
      this.store = new ParfameStore();
      this.addPiece(this.store);
      this.addPiece(new ProjectTowers({ reducedMotion: this.reducedMotion }));
    });
    await step('Indexing the documents', 0.58, () => {
      this.addPiece(new AIHall({ quality: this.quality }));
    });
    await step('Climbing to the roof', 0.7, () => {
      this.addPiece(new Rooftop({ quality: this.quality, reducedMotion: this.reducedMotion }));
    });
    await step('Wetting the streets', 0.35, () => {
      const { w, h } = this.#reflectionSize();
      this.ground = new Ground({ width: w, height: h });
      this.scene.add(this.ground.mesh);
      this.ground.configureReflectionCamera(this.camera);
      this.rain = new Rain({ count: this.quality === 'low' ? 4500 : 9000 });
      this.scene.add(this.rain.mesh);
    });
    await step('Tuning the neon', 0.85, () => this.#setupComposer());

    onProgress(0.92, 'Compiling shaders');
    try {
      await this.renderer.compileAsync(this.scene, this.camera);
    } catch {
      // compileAsync is an optimisation only
    }
    this.resize();
    this.composer.render();
    onProgress(1, 'Ready');
  }

  addPiece(piece) {
    this.pieces.push(piece);
    if (piece.group) this.scene.add(piece.group);
  }

  #setupComposer() {
    const size = this.renderer.getSize(new THREE.Vector2());
    this.composer = new EffectComposer(this.renderer);
    this.composer.setPixelRatio(this.pixelRatio);
    this.composer.setSize(size.x, size.y);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    // Softer bloom and a higher threshold keep neon saturated instead of blowing out to white
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.42, 0.4, 0.5);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.fx = new ShaderPass(FXShader);
    this.composer.addPass(this.fx);
  }

  #reflectionSize() {
    const scale = this.quality === 'low' ? 0.33 : 0.5;
    return {
      w: window.innerWidth * this.pixelRatio * scale,
      h: window.innerHeight * this.pixelRatio * scale,
    };
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.rig.applyLens();
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(w, h, false);
    if (this.composer) {
      this.composer.setPixelRatio(this.pixelRatio);
      this.composer.setSize(w, h);
    }
    if (this.ground) {
      const rs = this.#reflectionSize();
      this.ground.setSize(rs.w, rs.h);
    }
    for (const p of this.pieces) p.setPixelRatio?.(this.pixelRatio);
    this.city?.setPixelRatio(this.pixelRatio);
  }

  setStory(s) {
    this.rig.setStory(s);
  }

  jumpTo(s) {
    this.rig.jumpTo(s);
  }

  setPointer(x, y) {
    this.rig.setPointer(x, y);
  }

  /**
   * Returns 'bottle', 'chart' or null for a point in normalized device coordinates.
   * Only the Parfame store is pickable, and only while its chapter is on screen.
   */
  pick(x, y) {
    if (!this.store || !this.store.isInteractive(this.rig.s)) return null;
    this.raycaster ??= new THREE.Raycaster();
    this.raycaster.setFromCamera(new THREE.Vector2(x, y), this.camera);
    const hit = this.raycaster.intersectObjects(this.store.pickTargets, false)[0];
    return hit?.object.userData.pick ?? null;
  }

  setHover(kind) {
    this.store?.setHover(kind);
  }

  setScrollVelocity(v) {
    this.scrollVelocity = v;
  }

  start() {
    this.timer.connect(document);
    this.timer.reset();
    this.renderer.setAnimationLoop((timestamp) => this.#tick(timestamp));
  }

  stop() {
    this.renderer.setAnimationLoop(null);
  }

  #tick(timestamp) {
    this.timer.update(timestamp);
    const dt = Math.min(this.timer.getDelta(), 1 / 20);
    this.time += dt;
    const t = this.time;

    this.rig.update(dt, t);
    const s = this.rig.s;

    // Atmosphere per scene: thicker inside, clear on the rooftop
    const density =
      lerp(0.013, 0.02, band(s, 0.6, 1.0, 1.55, 1.8)) +
      0.012 * band(s, 2.56, 2.64, 2.74, 2.88) -
      0.0065 * smoothstep(2.75, 3.0, s);
    this.scene.fog.density = density;

    this.sky.update(t, dt, this.camera, this.scene.fog.color);
    this.city.update(t);
    this.ground.update(t, this.scene.fog);
    this.rain.update(t, this.camera);
    for (const p of this.pieces) p.update?.(t, dt, s, this);

    // Post FX: portal flash, scroll-speed aberration
    const flash = this.reducedMotion ? 0 : band(s, 2.55, 2.6, 2.61, 2.7);
    this.fx.uniforms.uFlash.value = flash;
    this.fx.uniforms.uTime.value = t;
    const ab = 0.0012 + clamp(Math.abs(this.scrollVelocity) * 0.00006, 0, 0.006);
    this.fx.uniforms.uAberration.value = damp(this.fx.uniforms.uAberration.value, ab, 6, dt);

    this.composer.render(dt);
    this.#adaptQuality(dt);
  }

  /** Lowers resolution when frames are slow, raises it again when there is headroom. */
  #adaptQuality(dt) {
    this.frameTimes.push(dt);
    this.adaptTimer += dt;
    if (this.adaptTimer < 2) return;
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    this.frameTimes.length = 0;
    this.adaptTimer = 0;
    let next = this.pixelRatio;
    if (avg > 1 / 42) next = Math.max(this.minPixelRatio, this.pixelRatio - 0.15);
    else if (avg < 1 / 58) next = Math.min(this.maxPixelRatio, this.pixelRatio + 0.05);
    if (Math.abs(next - this.pixelRatio) > 0.01) {
      this.pixelRatio = next;
      this.resize();
    }
  }
}
