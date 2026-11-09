import * as THREE from 'three';
import { GLSL_NOISE } from '../utils.js';

/** Gradient dome with slow, city-lit clouds. Follows the camera so it never gets closer. */
export class Sky {
  constructor({ fogColor }) {
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uFogColor: { value: fogColor.clone() },
        uZenith: { value: new THREE.Color('#030208') },
        uGlow: { value: new THREE.Color('#5a1d5e') },
        uFlash: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = position;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_Position.z = gl_Position.w * 0.99999;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform vec3 uFogColor;
        uniform vec3 uZenith;
        uniform vec3 uGlow;
        uniform float uFlash;
        varying vec3 vDir;
        ${GLSL_NOISE}
        void main() {
          vec3 d = normalize(vDir);
          float h = d.y;
          vec3 col = mix(uFogColor, uZenith, smoothstep(0.0, 0.55, h));
          vec2 uv = d.xz / max(h + 0.18, 0.06);
          float c = fbm(uv * 0.55 + vec2(uTime * 0.008, uTime * 0.003));
          float clouds = smoothstep(0.42, 0.8, c) * smoothstep(-0.02, 0.2, h) * (1.0 - smoothstep(0.25, 0.85, h));
          col += uGlow * clouds * (0.08 + uFlash * 0.6);
          col += uGlow * uFlash * 0.05;
          gl_FragColor = vec4(col, 1.0);
        }
      `,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(700, 48, 24), this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -10;
    this.mesh.name = 'Sky';
    this.nextLightning = 6 + Math.random() * 8;
    this.flash = 0;
  }

  update(time, dt, camera, fogColor) {
    this.mesh.position.copy(camera.position);
    this.material.uniforms.uTime.value = time;
    this.material.uniforms.uFogColor.value.copy(fogColor);
    // Distant lightning: a quick double flicker every few seconds
    this.nextLightning -= dt;
    if (this.nextLightning <= 0) {
      this.flash = 1;
      this.nextLightning = 7 + Math.random() * 10;
    }
    this.flash = Math.max(0, this.flash - dt * 2.4);
    const f = this.flash;
    this.material.uniforms.uFlash.value = f > 0.6 ? f : f * (0.5 + 0.5 * Math.sin(time * 60));
  }
}
