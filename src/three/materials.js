import * as THREE from 'three';
import { GLSL_NOISE } from './utils.js';

/**
 * Additive neon material for canvas-drawn signs. Fog dims the light instead of tinting it,
 * which is how glowing things behave in haze.
 */
export function createNeonMaterial({ map, color = 0xffffff, intensity = 2.5, fogStrength = 1, side = THREE.FrontSide } = {}) {
  const material = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uMap: { value: null },
        uColor: { value: new THREE.Color(color) },
        uIntensity: { value: intensity },
        uFlicker: { value: 1 },
        uFogStrength: { value: fogStrength },
      },
    ]),
    vertexShader: /* glsl */ `
      #include <common>
      #include <fog_pars_vertex>
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <fog_pars_fragment>
      uniform sampler2D uMap;
      uniform vec3 uColor;
      uniform float uIntensity;
      uniform float uFlicker;
      uniform float uFogStrength;
      varying vec2 vUv;
      void main() {
        vec2 uv = vUv;
        if (!gl_FrontFacing) uv.x = 1.0 - uv.x;
        vec4 t = texture2D(uMap, uv);
        vec3 col = t.rgb * t.a * uColor * uIntensity * uFlicker;
        #ifdef USE_FOG
          #ifdef FOG_EXP2
            float fogFactor = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
          #else
            float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
          #endif
          col *= 1.0 - fogFactor * uFogStrength;
        #endif
        gl_FragColor = vec4(col, 1.0);
      }
    `,
    side,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: true,
  });
  // UniformsUtils.merge clones values, so assign the shared texture afterwards
  material.uniforms.uMap.value = map;
  return material;
}

/**
 * Holographic panel: texture + scanlines + edge glow + noise flicker, additive.
 * Used for floating documents, the Parfame UI and the skills billboard.
 */
export function createHoloMaterial({ map, color = 0xffffff, intensity = 1.6, scan = 1, slides = 1 } = {}) {
  const material = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uMap: { value: null },
        uColor: { value: new THREE.Color(color) },
        uIntensity: { value: intensity },
        uTime: { value: 0 },
        uSeed: { value: Math.random() * 10 },
        uScan: { value: scan },
        uReveal: { value: 1 },
        uOpacity: { value: 1 },
        uSlides: { value: slides },
        uSlide: { value: 0 },
        uGlitch: { value: 0 },
      },
    ]),
    vertexShader: /* glsl */ `
      #include <common>
      #include <fog_pars_vertex>
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <fog_pars_fragment>
      uniform sampler2D uMap;
      uniform vec3 uColor;
      uniform float uIntensity;
      uniform float uTime;
      uniform float uSeed;
      uniform float uScan;
      uniform float uReveal;
      uniform float uOpacity;
      uniform float uSlides;
      uniform float uSlide;
      uniform float uGlitch;
      varying vec2 vUv;
      ${GLSL_NOISE}

      vec4 sampleSlide(vec2 uv, float slide) {
        uv.y = (uv.y + (uSlides - 1.0 - slide)) / uSlides;
        return texture2D(uMap, uv);
      }

      void main() {
        vec2 uv = vUv;
        if (!gl_FrontFacing) uv.x = 1.0 - uv.x;
        float t = uTime + uSeed;
        // Horizontal tearing during glitches
        float band = floor(uv.y * 24.0);
        float tear = (hash12(vec2(band, floor(t * 18.0))) - 0.5) * uGlitch * 0.12;
        uv.x += tear;
        float slide = uSlide;
        vec4 tex = sampleSlide(clamp(uv, 0.0, 1.0), slide);
        if (uGlitch > 0.01) {
          vec4 r = sampleSlide(clamp(uv + vec2(0.012 * uGlitch, 0.0), 0.0, 1.0), slide);
          vec4 b = sampleSlide(clamp(uv - vec2(0.012 * uGlitch, 0.0), 0.0, 1.0), slide);
          tex.r = r.r;
          tex.b = b.b;
        }
        vec3 col = tex.rgb * tex.a;
        // Scanlines and a slow bright sweep
        float lines = 0.82 + 0.18 * sin(vUv.y * 420.0 + t * 6.0);
        float sweep = smoothstep(0.08, 0.0, abs(fract(vUv.y - t * 0.18) - 0.5) - 0.42) * 0.6 * uScan;
        float flick = 0.92 + 0.08 * vnoise(vec2(t * 12.0, 0.0));
        col = col * lines * flick + col * sweep;
        // Edge glow
        vec2 e = min(vUv, 1.0 - vUv);
        float edge = smoothstep(0.03, 0.0, min(e.x, e.y));
        col += uColor * edge * 0.25;
        // Reveal wipe from bottom to top
        float reveal = smoothstep(uReveal, uReveal - 0.04, vUv.y);
        col *= reveal * uColor * uIntensity * uOpacity;
        #ifdef USE_FOG
          #ifdef FOG_EXP2
            float fogFactor = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
          #else
            float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
          #endif
          col *= 1.0 - fogFactor;
        #endif
        gl_FragColor = vec4(col, 1.0);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    fog: true,
  });
  material.uniforms.uMap.value = map;
  return material;
}

/**
 * Neon flicker: steady hum most of the time, with occasional stutter bursts.
 */
export class Flicker {
  constructor({ min = 4, max = 11, depth = 0.85 } = {}) {
    this.min = min;
    this.max = max;
    this.depth = depth;
    this.wait = min + Math.random() * (max - min);
    this.burst = 0;
    this.value = 1;
  }

  update(dt) {
    if (this.burst > 0) {
      this.burst -= dt;
      const on = Math.random() > 0.45;
      this.value = on ? 1 : 1 - this.depth;
      if (this.burst <= 0) this.value = 1;
    } else {
      this.wait -= dt;
      this.value = 0.97 + Math.random() * 0.03;
      if (this.wait <= 0) {
        this.burst = 0.18 + Math.random() * 0.35;
        this.wait = this.min + Math.random() * (this.max - this.min);
      }
    }
    return this.value;
  }
}

/** Small studio of neon panels baked into a PMREM so glass and metal have something to reflect. */
export function createNeonEnvironment(renderer) {
  const scene = new THREE.Scene();
  scene.add(new THREE.Mesh(new THREE.BoxGeometry(30, 30, 30), new THREE.MeshBasicMaterial({ color: 0x060410, side: THREE.BackSide })));
  const panel = (color, intensity, w, h, pos) => {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide }),
    );
    mesh.position.set(...pos);
    mesh.lookAt(0, 0, 0);
    scene.add(mesh);
  };
  panel('#ff3d9a', 7, 8, 1.4, [-12, 4, -5]);
  panel('#3ff0ff', 5, 1.2, 10, [12, 1, 3]);
  panel('#9b5cff', 4, 12, 3, [0, 13, 0]);
  panel('#ff2e4d', 6, 5, 1.2, [4, -3, 12]);
  panel('#ffb347', 3, 2.5, 2.5, [-6, 6, 12]);
  panel('#ffffff', 4, 4, 0.6, [0, 10, -11]);
  panel('#ff3d9a', 3, 3, 6, [-2, 0, -13]);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const target = pmrem.fromScene(scene, 0.035);
  pmrem.dispose();
  scene.traverse((o) => {
    o.geometry?.dispose();
    o.material?.dispose();
  });
  return target.texture;
}
