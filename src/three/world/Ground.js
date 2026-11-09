import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { GLSL_NOISE } from '../utils.js';
import { LAYOUT } from '../layout.js';

const { ds, store, street } = LAYOUT;

const WetGroundShader = {
  name: 'WetGroundShader',
  uniforms: {
    color: { value: null },
    tDiffuse: { value: null },
    textureMatrix: { value: null },
    uTime: { value: 0 },
    uRain: { value: 1 },
    uFogColor: { value: new THREE.Color() },
    uFogDensity: { value: 0.015 },
  },
  vertexShader: /* glsl */ `
    uniform mat4 textureMatrix;
    varying vec4 vUv;
    varying vec3 vWorld;
    varying float vFogDepth;
    void main() {
      vUv = textureMatrix * vec4(position, 1.0);
      vec4 world = modelMatrix * vec4(position, 1.0);
      vWorld = world.xyz;
      vec4 mv = viewMatrix * world;
      vFogDepth = -mv.z;
      gl_Position = projectionMatrix * mv;
    }
  `,
  fragmentShader: /* glsl */ `
    uniform vec3 color;
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uRain;
    uniform vec3 uFogColor;
    uniform float uFogDensity;
    varying vec4 vUv;
    varying vec3 vWorld;
    varying float vFogDepth;
    ${GLSL_NOISE}

    // Expanding rain rings, one per grid cell, two layers
    vec3 ripples(vec2 p, float t) {
      vec3 acc = vec3(0.0);
      for (int k = 0; k < 2; k++) {
        float fk = float(k);
        vec2 q = p * (1.7 + fk * 0.9) + fk * 7.31;
        vec2 cell = floor(q);
        vec2 f = fract(q);
        float h = hash12(cell + fk * 13.1);
        vec2 c = vec2(hash12(cell + 1.7), hash12(cell + 9.2)) * 0.5 + 0.25;
        float ph = fract(t * (0.7 + h * 0.6) + h);
        vec2 d = f - c;
        float r = length(d);
        float rad = ph * 0.42;
        float ring = sin((r - rad) * 70.0) * smoothstep(0.045, 0.0, abs(r - rad)) * (1.0 - ph);
        acc.xy += (d / max(r, 1e-3)) * ring;
        acc.z += max(ring, 0.0);
      }
      return acc;
    }

    void main() {
      vec2 p = vWorld.xz;
      bool inHall = vWorld.z < ${(ds.zFront - 0.5).toFixed(2)} && abs(vWorld.x) < ${ds.xMax.toFixed(2)};
      bool inStore = vWorld.x > ${store.facadeX.toFixed(2)} && vWorld.x < ${store.backX.toFixed(2)} && vWorld.z > ${store.zMin.toFixed(2)} && vWorld.z < ${store.zMax.toFixed(2)};
      bool indoor = inHall || inStore;

      float puddle = indoor ? 0.92 : smoothstep(0.40, 0.62, fbm(p * 0.17));
      float grain = vnoise(p * 9.0);

      vec2 off = (vec2(vnoise(p * 0.9), vnoise(p * 0.9 + 31.0)) - 0.5) * mix(0.02, 0.005, puddle);
      vec3 rip = vec3(0.0);
      if (!inStore) {
        rip = ripples(p, uTime) * uRain * (inHall ? 0.4 : 1.0);
        off += rip.xy * 0.006;
      }

      // Vertical smear: neon reflections stretch into streaks on wet asphalt
      vec3 refl = vec3(0.0);
      float wsum = 0.0;
      float smear = mix(0.011, 0.0035, puddle);
      for (int i = 0; i < 5; i++) {
        float fi = float(i) - 2.0;
        float w = 1.0 - abs(fi) * 0.28;
        vec4 uv = vUv;
        uv.xy += (off + vec2(0.0, fi * smear)) * uv.w;
        refl += texture2DProj(tDiffuse, uv).rgb * w;
        wsum += w;
      }
      refl /= wsum;

      vec3 base = vec3(0.010, 0.009, 0.014) * (0.6 + 0.8 * grain);
      float reflectivity = mix(0.32, 0.92, puddle);

      if (!indoor) {
        float ax = abs(vWorld.x);
        float onStreet = step(${street.zMin.toFixed(1)}, vWorld.z) * step(vWorld.z, ${street.zMax.toFixed(1)});
        if (ax > ${street.halfRoad.toFixed(1)}) {
          vec2 tile = fract(p / 1.5);
          float seam = step(tile.x, 0.03) + step(tile.y, 0.03);
          base = vec3(0.020, 0.017, 0.026) * (0.8 + 0.4 * grain) - seam * 0.007;
          reflectivity *= 0.78;
        }
        float curb = smoothstep(0.08, 0.0, abs(ax - ${street.halfRoad.toFixed(1)})) * onStreet;
        base += vec3(0.05, 0.045, 0.06) * curb;
        float centre = step(abs(vWorld.x), 0.09) * step(fract(vWorld.z / 7.0), 0.55) * onStreet;
        float edge = step(abs(ax - 5.6), 0.07) * onStreet;
        float zebra = step(-25.5, vWorld.z) * step(vWorld.z, -20.5) * step(ax, 5.6) * step(fract(vWorld.x / 1.1), 0.5);
        float paint = max(max(centre, edge), zebra);
        base = mix(base, vec3(0.16, 0.15, 0.18), paint * 0.7);
        reflectivity *= 1.0 - paint * 0.45;
      } else {
        vec2 tile = fract(p / 2.0);
        float seam = step(tile.x, 0.015) + step(tile.y, 0.015);
        base = vec3(0.012, 0.012, 0.018) - seam * 0.004;
        reflectivity = inStore ? 0.8 : 0.72;
      }

      vec3 V = normalize(cameraPosition - vWorld);
      float fres = pow(1.0 - clamp(V.y, 0.0, 1.0), 2.0);
      reflectivity *= mix(0.5, 1.0, fres);

      vec3 col = base + refl * reflectivity * color + rip.z * 0.015;
      float fogFactor = 1.0 - exp(-uFogDensity * uFogDensity * vFogDepth * vFogDepth);
      col = mix(col, uFogColor, fogFactor);
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

export class Ground {
  constructor({ width, height }) {
    const geometry = new THREE.PlaneGeometry(900, 900);
    this.mesh = new Reflector(geometry, {
      shader: WetGroundShader,
      textureWidth: width,
      textureHeight: height,
      clipBias: 0.002,
      color: 0xffffff,
      multisample: 0,
    });
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.name = 'WetGround';
    this.uniforms = this.mesh.material.uniforms;
  }

  /** Keep layer-1 objects (rain, close-up particles) out of the reflection pass. */
  configureReflectionCamera(camera) {
    const reflectionCamera = this.mesh.getReflectionCamera(camera);
    reflectionCamera.layers.set(0);
  }

  setSize(width, height) {
    this.mesh.getRenderTarget().setSize(Math.max(64, Math.floor(width)), Math.max(64, Math.floor(height)));
  }

  update(time, fog) {
    this.uniforms.uTime.value = time;
    this.uniforms.uFogColor.value.copy(fog.color);
    this.uniforms.uFogDensity.value = fog.density;
  }
}
