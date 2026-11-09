import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { LAYOUT } from '../layout.js';
import { createHoloMaterial, createNeonMaterial, Flicker } from '../materials.js';
import { bottleLabelTexture, createParfameUI, neonWordTexture } from '../textures.js';
import { band, createRandom, PALETTE, smoothstep } from '../utils.js';

const { store } = LAYOUT;
const B = store.bottle;

export class ParfameStore {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'ParfameStore';
    this.rng = createRandom(88);
    this.#createRoom();
    this.#createFacade();
    this.#createPedestal();
    this.#createBottle();
    this.#createLightBeam();
    this.#createShelves();
    this.#createUI();
    this.#createLights();
  }

  #createRoom() {
    const wallMat = new THREE.MeshStandardMaterial({ color: '#100b16', roughness: 0.7, metalness: 0.1, envMapIntensity: 0.25 });
    const w = store.backX - store.facadeX;
    const d = store.zMax - store.zMin;
    const h = store.height;
    const cz = (store.zMin + store.zMax) / 2;
    const plane = (pw, ph, pos, rot) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), wallMat);
      m.position.set(...pos);
      m.rotation.set(...rot);
      this.group.add(m);
    };
    plane(d, h, [store.backX, h / 2, cz], [0, -Math.PI / 2, 0]); // back wall faces -x
    plane(w, h, [store.facadeX + w / 2, h / 2, store.zMin], [0, 0, 0]); // faces +z
    plane(w, h, [store.facadeX + w / 2, h / 2, store.zMax], [0, Math.PI, 0]); // faces -z
    plane(w, d, [store.facadeX + w / 2, h, cz], [Math.PI / 2, 0, 0]); // ceiling faces down

    // Ceiling light slots
    const slotMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd9ec').multiplyScalar(1.4) });
    for (let i = 0; i < 3; i++) {
      const slot = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.04, d - 2), slotMat);
      slot.position.set(store.facadeX + 1.5 + i * 2.6, h - 0.03, cz);
      this.group.add(slot);
    }
  }

  #createFacade() {
    const x = store.facadeX;
    const cz = (store.zMin + store.zMax) / 2;
    const d = store.zMax - store.zMin;
    const frameMat = new THREE.MeshStandardMaterial({ color: '#07060b', roughness: 0.35, metalness: 0.8, envMapIntensity: 0.8 });
    const box = (sx, sy, sz, px, py, pz) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), frameMat);
      m.position.set(px, py, pz);
      this.group.add(m);
    };
    box(0.4, 0.6, d + 2, x, store.height - 0.05, cz); // header
    box(0.4, 0.35, d + 2, x, 0.175, cz); // base
    box(0.45, store.height, 0.5, x, store.height / 2, store.zMin - 0.25); // pillars
    box(0.45, store.height, 0.5, x, store.height / 2, store.zMax + 0.25);
    box(0.25, store.height, 0.12, x, store.height / 2, cz); // mullion

    // Glass: faint, mostly reflections
    const glass = new THREE.Mesh(
      new THREE.PlaneGeometry(d, store.height - 0.9),
      new THREE.MeshPhysicalMaterial({
        color: '#ffffff',
        roughness: 0.04,
        metalness: 0,
        transparent: true,
        opacity: 0.1,
        envMapIntensity: 1.4,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    glass.position.set(x + 0.02, store.height / 2 - 0.1, cz);
    glass.rotation.y = -Math.PI / 2;
    this.group.add(glass);

    // Neon under the header and the PARFAME sign above it
    const strip = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.06, d + 0.6),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.pink).multiplyScalar(3) }),
    );
    strip.position.set(x - 0.22, store.height - 0.38, cz);
    this.group.add(strip);

    const signMap = neonWordTexture('PARFAME', { color: '#ff3d8f', width: 2048, height: 480, size: 270, frame: false });
    this.signMaterial = createNeonMaterial({ map: signMap, color: '#ffe0ee', intensity: 2.8, fogStrength: 0.6, side: THREE.DoubleSide });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(10, 10 * (480 / 2048)), this.signMaterial);
    sign.position.set(x - 0.25, store.height + 1.7, cz);
    sign.rotation.y = -Math.PI / 2;
    this.group.add(sign);
    this.signFlicker = new Flicker({ min: 5, max: 12, depth: 0.9 });
  }

  #createPedestal() {
    const stone = new THREE.MeshPhysicalMaterial({
      color: '#0c0a12',
      roughness: 0.18,
      metalness: 0.35,
      clearcoat: 1,
      clearcoatRoughness: 0.08,
      envMapIntensity: 1.1,
    });
    const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.8, 1.0, 64), stone);
    pedestal.position.set(B.x, 0.5, B.z);
    this.group.add(pedestal);
    const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.pink).multiplyScalar(4) });
    const top = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.018, 8, 96), ringMat);
    top.rotation.x = Math.PI / 2;
    top.position.set(B.x, 1.0, B.z);
    this.group.add(top);
    const bottom = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.014, 8, 96), ringMat);
    bottom.rotation.x = Math.PI / 2;
    bottom.position.set(B.x, 0.04, B.z);
    this.group.add(bottom);
    // Glow disc under the floating bottle
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(0.62, 48),
      new THREE.ShaderMaterial({
        uniforms: { uColor: { value: new THREE.Color(PALETTE.pink).multiplyScalar(0.9) } },
        vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: /* glsl */ `uniform vec3 uColor; varying vec2 vUv; void main(){ float d = length(vUv - 0.5) * 2.0; gl_FragColor = vec4(uColor * exp(-d * d * 4.0), 1.0); }`,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    disc.rotation.x = -Math.PI / 2;
    disc.position.set(B.x, 1.003, B.z);
    this.group.add(disc);
  }

  #createBottle() {
    const bottle = new THREE.Group();
    const glass = new THREE.MeshPhysicalMaterial({
      color: '#ffe8f2',
      roughness: 0.03,
      metalness: 0,
      transmission: 1,
      thickness: 0.35,
      ior: 1.5,
      attenuationColor: new THREE.Color('#ff86bd'),
      attenuationDistance: 0.9,
      clearcoat: 1,
      clearcoatRoughness: 0.02,
      envMapIntensity: 1.8,
    });
    const body = new THREE.Mesh(new RoundedBoxGeometry(0.62, 0.78, 0.36, 6, 0.09), glass);
    body.position.y = 0.39;
    bottle.add(body);

    const liquid = new THREE.Mesh(
      new RoundedBoxGeometry(0.5, 0.52, 0.25, 4, 0.06),
      new THREE.MeshStandardMaterial({ color: '#c2246a', emissive: '#ff1f73', emissiveIntensity: 0.32, roughness: 0.2 }),
    );
    liquid.position.y = 0.3;
    bottle.add(liquid);

    const roseGold = new THREE.MeshStandardMaterial({ color: '#f2bccb', metalness: 1, roughness: 0.16, envMapIntensity: 1.6 });
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.09, 0.12, 32), roseGold);
    neck.position.y = 0.84;
    bottle.add(neck);
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.05, 32), roseGold);
    collar.position.y = 0.92;
    bottle.add(collar);

    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 0.15, 0.3, 8, 1),
      new THREE.MeshPhysicalMaterial({
        color: '#ffd6ea',
        roughness: 0.05,
        transmission: 1,
        thickness: 0.3,
        ior: 1.6,
        flatShading: true,
        envMapIntensity: 2.2,
        clearcoat: 1,
      }),
    );
    cap.position.y = 1.1;
    bottle.add(cap);

    const label = new THREE.Mesh(
      new THREE.PlaneGeometry(0.42, 0.21),
      new THREE.MeshBasicMaterial({ map: bottleLabelTexture(), transparent: true, color: new THREE.Color(1.3, 1.2, 1.15), depthWrite: false }),
    );
    label.position.set(0, 0.46, 0.182);
    bottle.add(label);

    bottle.position.set(B.x, 1.07, B.z);
    this.bottle = bottle;
    this.group.add(bottle);

    // Invisible, generous hit volume so the bottle is easy to tap on small screens
    this.bottleHit = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.7, 1.1), new THREE.MeshBasicMaterial({ visible: false }));
    this.bottleHit.position.set(B.x, 1.07 + 0.6, B.z);
    this.bottleHit.userData.pick = 'bottle';
    this.group.add(this.bottleHit);
  }

  #createLightBeam() {
    this.ringBase = new THREE.Color(PALETTE.pink);
    const ringMat = new THREE.MeshBasicMaterial({ color: this.ringBase.clone().multiplyScalar(5) });
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.03, 12, 120), ringMat);
    this.ring.rotation.x = Math.PI / 2;
    this.ring.position.set(B.x, 3.35, B.z);
    this.group.add(this.ring);

    this.beamMaterial = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color('#ff5fae').multiplyScalar(0.55) } },
      vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform vec3 uColor; varying vec2 vUv;
        void main(){
          float fade = pow(vUv.y, 1.5);
          float rays = 0.75 + 0.25 * sin(vUv.x * 60.0 + uTime * 0.6) * sin(vUv.x * 23.0 - uTime * 0.4);
          gl_FragColor = vec4(uColor * fade * rays * 0.5, 1.0);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.95, 2.3, 48, 1, true), this.beamMaterial);
    beam.position.set(B.x, 3.35 - 1.15, B.z);
    this.group.add(beam);

    // Dust drifting in the light
    const count = 160;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const a = this.rng.next() * Math.PI * 2;
      const r = Math.sqrt(this.rng.next()) * 0.9;
      pos.set([Math.cos(a) * r, this.rng.range(1.1, 3.3), Math.sin(a) * r], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.dustMaterial = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uPixelRatio: { value: 1 } },
      vertexShader: /* glsl */ `
        uniform float uTime; uniform float uPixelRatio; varying float vA;
        void main(){
          vec3 p = position;
          p.y = 1.1 + mod(p.y - 1.1 + uTime * 0.06, 2.2);
          p.x += sin(uTime * 0.3 + position.y * 4.0) * 0.05;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          vA = smoothstep(1.1, 1.5, p.y) * smoothstep(3.3, 2.9, p.y);
          gl_PointSize = 3.0 * uPixelRatio * (3.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        varying float vA;
        void main(){ float d = length(gl_PointCoord - 0.5); gl_FragColor = vec4(vec3(1.0, 0.7, 0.85) * smoothstep(0.5, 0.0, d) * vA * 0.9, 1.0); }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const dust = new THREE.Points(geo, this.dustMaterial);
    dust.position.set(B.x, 0, B.z);
    dust.layers.set(1);
    this.group.add(dust);
  }

  #createShelves() {
    const x = store.backX - 0.3;
    const cz = (store.zMin + store.zMax) / 2;
    // Backlit panel behind the shelves
    const back = new THREE.Mesh(
      new THREE.PlaneGeometry(6.4, 3.4),
      new THREE.ShaderMaterial({
        uniforms: { uA: { value: new THREE.Color('#7a2cff').multiplyScalar(0.14) }, uB: { value: new THREE.Color('#ff3d9a').multiplyScalar(0.1) } },
        vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: /* glsl */ `uniform vec3 uA; uniform vec3 uB; varying vec2 vUv; void main(){ vec3 c = mix(uB, uA, vUv.x); float v = smoothstep(0.0, 0.2, vUv.y) * smoothstep(1.0, 0.8, vUv.y); gl_FragColor = vec4(c * (0.4 + 0.6 * v), 1.0); }`,
      }),
    );
    back.position.set(store.backX - 0.02, 2.4, cz);
    back.rotation.y = -Math.PI / 2;
    this.group.add(back);

    const shelfMat = new THREE.MeshStandardMaterial({ color: '#050408', roughness: 0.3, metalness: 0.7 });
    const edgeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.pink).multiplyScalar(2.2) });
    const bottleGeo = new RoundedBoxGeometry(0.22, 0.3, 0.12, 2, 0.03);
    const bottleMat = new THREE.MeshPhysicalMaterial({
      color: '#ffb3d6',
      roughness: 0.08,
      metalness: 0,
      transparent: true,
      opacity: 0.55,
      envMapIntensity: 1.6,
      clearcoat: 1,
    });
    const perShelf = 9;
    const shelves = [1.2, 2.1, 3.0];
    const minis = new THREE.InstancedMesh(bottleGeo, bottleMat, perShelf * shelves.length);
    const m = new THREE.Matrix4();
    let k = 0;
    for (const y of shelves) {
      const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.04, 6), shelfMat);
      shelf.position.set(x, y, cz);
      this.group.add(shelf);
      const edge = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 6), edgeMat);
      edge.position.set(x - 0.25, y + 0.02, cz);
      this.group.add(edge);
      for (let i = 0; i < perShelf; i++) {
        const s = this.rng.range(0.8, 1.2);
        m.makeScale(s, s, s);
        m.setPosition(x, y + 0.17 * s, cz - 2.6 + i * 0.65);
        minis.setMatrixAt(k++, m);
      }
    }
    this.group.add(minis);
  }

  #createUI() {
    this.ui = createParfameUI();
    this.uiMaterial = createHoloMaterial({ map: this.ui.texture, color: '#ffc4e1', intensity: 1.2, scan: 0.6 });
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 2.1 * (680 / 1024)), this.uiMaterial);
    panel.position.set(B.x + 0.9, 2.3, B.z + 1.7);
    panel.lookAt(8.4, 2.0, -5.4);
    panel.userData.pick = 'chart';
    this.group.add(panel);
    this.uiPanel = panel;
    this.hover = null;
    this.hoverMix = { bottle: 0, chart: 0 };
    this.typed = 0;
    this.typeTimer = 0;
    this.blinkTimer = 0;
  }

  #createLights() {
    const key = new THREE.PointLight('#ff6fb0', 4, 7, 1.8);
    key.position.set(B.x, 3.1, B.z);
    this.group.add(key);
    const fill = new THREE.PointLight('#5fe8ff', 4, 9, 1.6);
    fill.position.set(store.facadeX + 1, 2.4, store.zMax - 1.5);
    this.group.add(fill);
    const rim = new THREE.PointLight('#9b5cff', 4, 8, 1.8);
    rim.position.set(store.backX - 1, 3, store.zMin + 1.5);
    this.group.add(rim);
  }

  /** The bottle and the holo chart can be clicked while the shop chapter is on screen. */
  isInteractive(s) {
    return s > 0.9 && s < 1.6;
  }

  get pickTargets() {
    return [this.bottleHit, this.uiPanel];
  }

  setHover(kind) {
    this.hover = kind;
  }

  update(time, dt, s) {
    this.group.visible = s < 2.6;
    if (!this.group.visible) return;
    this.signMaterial.uniforms.uFlicker.value = this.signFlicker.update(dt);
    this.beamMaterial.uniforms.uTime.value = time;
    this.dustMaterial.uniforms.uTime.value = time;

    // Hover feedback eases in and out
    const k = 1 - Math.exp(-10 * dt);
    for (const key of ['bottle', 'chart']) {
      this.hoverMix[key] += ((this.hover === key ? 1 : 0) - this.hoverMix[key]) * k;
    }
    const hb = this.hoverMix.bottle;
    this.ring.material.color.copy(this.ringBase).multiplyScalar(4.5 + Math.sin(time * 2.2) * 0.6 + hb * 3);

    // Bottle floats and turns; the orbit adds a quarter turn so the label tracks the camera
    const orbit = smoothstep(1.0, 1.5, s);
    this.bottle.position.y = 1.07 + Math.sin(time * 1.3) * 0.025 + hb * 0.06;
    this.bottle.rotation.y = -0.9 + Math.sin(time * 0.45) * 0.25 + orbit * 1.4 + hb * Math.sin(time * 3) * 0.08;
    this.bottle.scale.setScalar(1 + hb * 0.05);

    // Holo UI: wipe in, then type the query
    const u = this.uiMaterial.uniforms;
    u.uTime.value = time;
    u.uIntensity.value = 1.2 + this.hoverMix.chart * 0.6;
    const active = band(s, 0.75, 0.95, 1.6, 1.85);
    u.uReveal.value = smoothstep(0.8, 1.05, s) * 1.06;
    u.uOpacity.value = 0.25 + 0.75 * active;
    if (active > 0.5) {
      this.typeTimer += dt;
      if (this.typeTimer > 0.075 && this.typed < this.ui.length) {
        this.typeTimer = 0;
        this.typed++;
        this.ui.draw(this.typed);
      }
    } else if (this.typed !== 0 && s < 0.7) {
      this.typed = 0;
      this.ui.draw(0);
    }
    this.blinkTimer += dt;
    if (this.blinkTimer > 0.5 && active > 0.5) {
      this.blinkTimer = 0;
      this.ui.draw(this.typed);
    }
  }

  setPixelRatio(pr) {
    this.dustMaterial.uniforms.uPixelRatio.value = pr;
  }
}
