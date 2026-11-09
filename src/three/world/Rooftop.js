import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LAYOUT } from '../layout.js';
import { companyPanelTexture } from '../textures.js';
import { createRandom, PALETTE, smoothstep } from '../utils.js';
import { SakuraTree } from './Sakura.js';

const { ds, roof } = LAYOUT;

// Stacked bottom to top, so the career rises with the camera
const COMPANIES = [
  { name: 'MAQ Software', role: 'Associate Software Engineer', dates: 'Aug 2023 – Feb 2024' },
  { name: 'Abstrabit\nTechnologies', role: 'Software Development Engineer', dates: 'Jul 2024 – Dec 2025' },
  { name: 'Intech Cloud', role: 'Software Developer', dates: 'Dec 2025 – Present' },
];

const PANEL_W = 3.8;
const PANEL_H = PANEL_W / 2;
const PANEL_GAP = 0.26;
const PANEL_BASE = 0.5;
// Panels switch on one after another once the camera clears the roof
const SWITCH_ON_AT = 2.93; // story time
const SWITCH_STAGGER = 0.38; // seconds between panels

export class Rooftop {
  constructor({ quality, reducedMotion = false }) {
    this.group = new THREE.Group();
    this.group.name = 'Rooftop';
    this.rng = createRandom(2718);
    this.reducedMotion = reducedMotion;
    this.switchedOnAt = -1;
    this.metal = new THREE.MeshStandardMaterial({ color: '#08070c', roughness: 0.35, metalness: 0.8, envMapIntensity: 0.8 });

    this.#createSlab();
    this.#createParapet();
    this.#createTower();
    this.#createProps();
    this.tree = new SakuraTree({
      position: roof.tree.clone(),
      scale: 0.9,
      seed: 21,
      rotation: 1.2,
      blossoms: quality === 'low' ? 1000 : 1800,
      petals: 160,
      palette: 'blue',
    });
    this.group.add(this.tree.group);

    // Pink rim light behind the tower, blue wash on the (blue) sakura
    const { tower } = roof;
    const pink = new THREE.PointLight(PALETTE.pink, 12, 12, 1.5);
    pink.position.set(tower.x - 0.8, roof.y + 5.4, tower.z + 1.6);
    const blue = new THREE.PointLight('#3f9dff', 9, 14, 1.5);
    blue.position.set(roof.tree.x - 1.5, roof.y + 3.2, roof.tree.z + 1);
    this.group.add(pink, blue);
  }

  /** Roof deck with an opening over the atrium, plus its underside as the shaft ceiling. */
  #createSlab() {
    const { hole } = roof;
    const rects = [
      [ds.xMin, ds.xMax, hole.zMax, ds.zFront],
      [ds.xMin, ds.xMax, ds.zBack, hole.zMin],
      [ds.xMin, hole.xMin, hole.zMin, hole.zMax],
      [hole.xMax, ds.xMax, hole.zMin, hole.zMax],
    ];
    const deck = (facingUp) =>
      mergeGeometries(
        rects.map(([x0, x1, z0, z1]) =>
          new THREE.PlaneGeometry(x1 - x0, z1 - z0)
            .rotateX(facingUp ? -Math.PI / 2 : Math.PI / 2)
            .translate((x0 + x1) / 2, 0, (z0 + z1) / 2),
        ),
      );
    const floor = new THREE.Mesh(
      deck(true),
      new THREE.MeshStandardMaterial({ color: '#0b0a10', roughness: 0.3, metalness: 0.3, envMapIntensity: 0.5 }),
    );
    floor.position.y = roof.y + 0.02;
    this.group.add(floor);

    const ceiling = new THREE.Mesh(
      deck(false),
      new THREE.MeshStandardMaterial({ color: '#07070b', roughness: 0.75, metalness: 0.3, envMapIntensity: 0.35 }),
    );
    ceiling.position.y = roof.y - 0.45;
    this.group.add(ceiling);

    // Slab edge around the opening
    const geos = [];
    const w = hole.xMax - hole.xMin;
    const d = hole.zMax - hole.zMin;
    const cx = (hole.xMin + hole.xMax) / 2;
    const cz = (hole.zMin + hole.zMax) / 2;
    const y = roof.y - 0.21;
    geos.push(new THREE.BoxGeometry(w + 0.2, 0.47, 0.1).translate(cx, y, hole.zMax));
    geos.push(new THREE.BoxGeometry(w + 0.2, 0.47, 0.1).translate(cx, y, hole.zMin));
    geos.push(new THREE.BoxGeometry(0.1, 0.47, d).translate(hole.xMin, y, cz));
    geos.push(new THREE.BoxGeometry(0.1, 0.47, d).translate(hole.xMax, y, cz));
    this.group.add(new THREE.Mesh(mergeGeometries(geos), this.metal));

    // Red light lines on the floor, like the storyboard: one leads the eye to the tower,
    // one runs past it to the right. Both stay clear of the text column.
    const { tower } = roof;
    const red = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.red).multiplyScalar(3.0) });
    const start = new THREE.Vector3(1.0, 0, -43.5);
    const corner = new THREE.Vector3(tower.x + 0.5, 0, tower.z - 1.6);
    const lead = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.03, start.distanceTo(corner)), red);
    lead.position.copy(start).lerp(corner, 0.5).setY(roof.y + 0.04);
    lead.lookAt(corner.x, roof.y + 0.04, corner.z);
    const runEnd = ds.xMin + 0.8;
    const run = new THREE.Mesh(new THREE.BoxGeometry(corner.x - runEnd, 0.03, 0.06), red);
    run.position.set((corner.x + runEnd) / 2, roof.y + 0.04, corner.z);
    this.group.add(lead, run);
  }

  #createParapet() {
    const geos = [];
    const y = roof.y;
    const zf = ds.zFront + 0.25;
    const w = ds.xMax - ds.xMin;
    const d = ds.zFront - ds.zBack;
    const box = (sx, sy, sz, x, yy, z) => geos.push(new THREE.BoxGeometry(sx, sy, sz).translate(x, yy, z));
    box(w, 0.7, 0.4, 0, y + 0.35, zf);
    box(0.4, 0.7, d, ds.xMin + 0.2, y + 0.35, (ds.zFront + ds.zBack) / 2);
    box(0.4, 0.7, d, ds.xMax - 0.2, y + 0.35, (ds.zFront + ds.zBack) / 2);
    // Railing posts + top rail along the front edge
    for (let x = ds.xMin + 0.5; x <= ds.xMax - 0.4; x += 1.6) box(0.05, 0.75, 0.05, x, y + 1.07, zf);
    box(w - 0.6, 0.05, 0.06, 0, y + 1.45, zf);
    box(w - 0.6, 0.03, 0.04, 0, y + 1.1, zf);
    // End cap where the neon strip stops
    const stripEnd = 3.2;
    box(0.12, 0.16, 0.1, stripEnd, y + 0.72, zf - 0.22);
    const mesh = new THREE.Mesh(
      mergeGeometries(geos),
      new THREE.MeshStandardMaterial({ color: '#09080d', roughness: 0.4, metalness: 0.75, envMapIntensity: 0.7 }),
    );
    geos.forEach((g) => g.dispose());
    this.group.add(mesh);

    // Neon strip on the right part of the parapet only, so it never runs behind the text
    const x0 = ds.xMin + 0.4;
    const strip = new THREE.Mesh(
      new THREE.BoxGeometry(stripEnd - x0, 0.05, 0.05),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.pink).multiplyScalar(2.4) }),
    );
    strip.position.set((x0 + stripEnd) / 2, y + 0.72, zf - 0.22);
    this.group.add(strip);
  }

  /** Mast with the three company screens stacked on it, turned toward the final camera. */
  #createTower() {
    const { tower, towerFacing } = roof;
    const g = new THREE.Group();
    g.position.copy(tower);
    g.rotation.y = Math.atan2(towerFacing.x - tower.x, towerFacing.z - tower.z);
    this.group.add(g);

    const top = PANEL_BASE + COMPANIES.length * (PANEL_H + PANEL_GAP) - PANEL_GAP;
    const postX = PANEL_W / 2 + 0.24;
    const mastH = top + 0.5;
    const geos = [];
    const box = (sx, sy, sz, x, y, z) => geos.push(new THREE.BoxGeometry(sx, sy, sz).translate(x, y, z));
    box(PANEL_W + 1.0, 0.22, 1.1, 0, 0.11, -0.12);
    for (const sx of [-1, 1]) box(0.16, mastH, 0.16, sx * postX, mastH / 2, -0.12);
    box(postX * 2 + 0.16, 0.1, 0.12, 0, mastH, -0.12);
    this.panels = [];
    COMPANIES.forEach((c, i) => {
      const cy = PANEL_BASE + i * (PANEL_H + PANEL_GAP) + PANEL_H / 2;
      box(PANEL_W + 0.14, PANEL_H + 0.14, 0.1, 0, cy, 0);
      const material = new THREE.MeshBasicMaterial({
        map: companyPanelTexture({ name: c.name, role: c.role, dates: c.dates, color: PALETTE.pink }),
        color: new THREE.Color(0, 0, 0),
      });
      const face = new THREE.Mesh(new THREE.PlaneGeometry(PANEL_W, PANEL_H), material);
      face.position.set(0, cy, 0.052);
      g.add(face);
      this.panels.push({ material, flick: this.rng.next() * 10 });
    });
    g.add(new THREE.Mesh(mergeGeometries(geos), this.metal));
    geos.forEach((geo) => geo.dispose());

    const neon = new THREE.Mesh(
      new THREE.BoxGeometry(postX * 2 + 0.1, 0.06, 0.06),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.pink).multiplyScalar(3) }),
    );
    neon.position.set(0, mastH - 0.12, 0.0);
    g.add(neon);
    this.towerBeacon = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 0.3, 0.3) }));
    this.towerBeacon.position.set(postX, mastH + 0.14, -0.12);
    g.add(this.towerBeacon);
  }

  #createProps() {
    const geos = [];
    const y = roof.y;
    const box = (sx, sy, sz, x, z) => geos.push(new THREE.BoxGeometry(sx, sy, sz).translate(x, y + sy / 2, z));
    box(2.2, 1.3, 1.6, 10.5, -40);
    box(2.2, 1.3, 1.6, 10.5, -42.4);
    box(1.4, 0.9, 1.4, -10, -52);
    box(4, 3.2, 4.4, 9.5, -55);
    box(0.25, 6, 0.25, -12.5, -62);
    const tank = new THREE.CylinderGeometry(1.6, 1.6, 3.2, 24).translate(11, y + 2.6, -64);
    geos.push(tank, new THREE.CylinderGeometry(0.1, 0.1, 1.4, 6).translate(11, y + 0.7, -64));
    const mesh = new THREE.Mesh(
      mergeGeometries(geos.map((g) => g.toNonIndexed())),
      new THREE.MeshStandardMaterial({ color: '#0c0b12', roughness: 0.6, metalness: 0.5, envMapIntensity: 0.5 }),
    );
    geos.forEach((g) => g.dispose());
    this.group.add(mesh);
    this.beacon = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 0.3, 0.3) }));
    this.beacon.position.set(-12.5, y + 6.1, -62);
    this.group.add(this.beacon);
  }

  setPixelRatio(pr) {
    this.tree.setPixelRatio(pr);
  }

  update(time, dt, s) {
    this.tree.update(time);
    const blink = Math.sin(time * 2.2) > 0.2;
    this.beacon.visible = blink;
    this.towerBeacon.visible = !blink;

    // Screens switch on bottom to top once the camera is out of the shaft. The sequence runs on
    // time rather than scroll, so the panels always finish switching on even if the visitor stops.
    if (s > SWITCH_ON_AT) {
      if (this.switchedOnAt < 0) this.switchedOnAt = time;
    } else {
      this.switchedOnAt = -1;
    }
    const elapsed = this.switchedOnAt < 0 ? -1 : time - this.switchedOnAt;
    this.panels.forEach((p, i) => {
      const local = elapsed - i * SWITCH_STAGGER;
      const on = elapsed < 0 ? 0 : this.reducedMotion ? 1 : smoothstep(0, 0.5, local);
      const stutter = on > 0 && on < 1 ? (Math.sin(time * 70 + p.flick) > 0 ? 1 : 0.2) : 1;
      p.material.color.setScalar(on * stutter * (0.92 + Math.sin(time * 1.3 + p.flick) * 0.03));
    });
  }
}
