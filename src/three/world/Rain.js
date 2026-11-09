import * as THREE from 'three';
import { createRandom } from '../utils.js';
import { LAYOUT } from '../layout.js';

/**
 * Camera-facing rain streaks. Drops live in a box that wraps around the camera,
 * so a fixed number of instances covers the whole world.
 */
export class Rain {
  constructor({ count = 9000 } = {}) {
    const rng = createRandom(5);
    const base = new THREE.PlaneGeometry(1, 1);
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.index = base.index;
    geometry.setAttribute('position', base.getAttribute('position'));
    geometry.setAttribute('uv', base.getAttribute('uv'));
    const seeds = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) seeds.set([rng.next(), rng.next(), rng.next(), rng.next()], i * 4);
    geometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));
    geometry.instanceCount = count;

    const { store } = LAYOUT;
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uCam: { value: new THREE.Vector3() },
        uBox: { value: new THREE.Vector3(46, 30, 46) },
        uWind: { value: new THREE.Vector2(0.12, 0.05) },
        uLength: { value: 0.95 },
        uWidth: { value: 0.022 },
        uOpacity: { value: 1 },
        uColor: { value: new THREE.Color(0.5, 0.56, 0.78) },
        uShelterMin: { value: new THREE.Vector3(store.facadeX - 0.2, -1, store.zMin - 0.2) },
        uShelterMax: { value: new THREE.Vector3(store.backX + 4, store.height + 0.3, store.zMax + 0.2) },
      },
      vertexShader: /* glsl */ `
        attribute vec4 aSeed;
        uniform float uTime;
        uniform vec3 uCam;
        uniform vec3 uBox;
        uniform vec2 uWind;
        uniform float uLength;
        uniform float uWidth;
        uniform vec3 uShelterMin;
        uniform vec3 uShelterMax;
        varying vec2 vUv;
        varying float vFade;
        void main() {
          vUv = uv;
          float speed = mix(15.0, 23.0, aSeed.w);
          vec3 dir = normalize(vec3(uWind.x, -1.0, uWind.y));
          vec3 p = aSeed.xyz * uBox + dir * uTime * speed;
          p = mod(p - uCam + uBox * 0.5, uBox) - uBox * 0.5 + uCam;

          vec3 rel = p - uCam;
          vec3 toCam = normalize(cameraPosition - p);
          vec3 side = normalize(cross(dir, toCam));
          vec3 world = p + side * position.x * uWidth - dir * (position.y + 0.5) * uLength;

          float dist = length(rel);
          float edge = max(abs(rel.x) / uBox.x, max(abs(rel.y) / uBox.y, abs(rel.z) / uBox.z));
          vFade = smoothstep(0.6, 2.5, dist) * (1.0 - smoothstep(0.38, 0.5, edge));
          vec3 inS = step(uShelterMin, p) * step(p, uShelterMax);
          vFade *= 1.0 - inS.x * inS.y * inS.z;

          gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uOpacity;
        varying vec2 vUv;
        varying float vFade;
        void main() {
          float across = 1.0 - abs(vUv.x - 0.5) * 2.0;
          float along = 1.0 - vUv.y;
          float a = across * across * pow(along, 0.6) * vFade * uOpacity;
          if (a < 0.002) discard;
          gl_FragColor = vec4(uColor * a * 0.9, 1.0);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    this.mesh.layers.set(1);
    this.mesh.name = 'Rain';
  }

  update(time, camera) {
    this.material.uniforms.uTime.value = time;
    this.material.uniforms.uCam.value.copy(camera.position);
  }
}
