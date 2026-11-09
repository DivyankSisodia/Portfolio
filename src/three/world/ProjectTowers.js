import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LAYOUT, projectTowerYaw } from '../layout.js';
import { projectHoardingTexture } from '../textures.js';
import { band, PALETTE, smoothstep } from '../utils.js';

/**
 * Chapter 3: hoardings on the three project skyscrapers (the towers themselves are City
 * instances). Each hoarding switches on with a flicker as the camera reaches it.
 */
const PROJECTS = [
  {
    name: 'RAG Knowledge Search',
    where: 'Intech Cloud',
    desc: 'Search over application data and technical docs. Automates knowledge retrieval and cuts manual lookup for engineers.',
    tags: ['RAG', 'Vector search', 'LLM'],
    color: PALETTE.cyan,
    onAt: 1.86,
    focus: [1.8, 1.95, 2.07, 2.13],
  },
  {
    name: 'Marketplace Recommendations',
    where: 'Intech Cloud',
    desc: 'Car-marketplace recommendations from user behavior and listing data, served by Node.js, PostgreSQL and Redis.',
    tags: ['ML', 'Node.js', 'Redis'],
    color: PALETTE.pink,
    onAt: 2.08,
    focus: [2.1, 2.16, 2.27, 2.33],
  },
  {
    name: 'AI Agent Workflows',
    where: 'Abstrabit',
    desc: 'EC2 + Lambda email autoresponder (+20% efficiency), n8n + Supabase orchestration and CRM sync with AI agents (+25%).',
    tags: ['AutoGen', 'n8n', 'AWS Lambda'],
    color: PALETTE.violet,
    onAt: 2.26,
    focus: [2.28, 2.34, 2.7, 2.8],
  },
];

const ON_DURATION = 0.7;

export class ProjectTowers {
  constructor({ reducedMotion = false } = {}) {
    this.group = new THREE.Group();
    this.group.name = 'ProjectTowers';
    this.reducedMotion = reducedMotion;
    this.boards = [];

    const { towers } = LAYOUT.projects;
    const metal = new THREE.MeshStandardMaterial({ color: '#0b0a10', roughness: 0.45, metalness: 0.8, envMapIntensity: 0.6 });

    towers.forEach((t, i) => {
      const p = PROJECTS[i];
      const g = new THREE.Group();
      g.position.set(t.x, 0, t.z);
      g.rotation.y = projectTowerYaw(t);
      this.group.add(g);

      const front = t.d / 2;
      const { w, h, y } = t.board;
      // Frame, brackets back to the facade and a catwalk under the board
      const geos = [
        new THREE.BoxGeometry(w + 0.36, h + 0.36, 0.22).translate(0, y, front + 0.55),
        new THREE.BoxGeometry(w + 0.6, 0.12, 0.9).translate(0, y - h / 2 - 0.55, front + 0.45),
      ];
      for (const sx of [-1, 1]) {
        for (const sy of [-1, 1]) geos.push(new THREE.BoxGeometry(0.14, 0.14, 0.5).translate(sx * (w / 2 - 0.6), y + sy * (h / 2 - 0.5), front + 0.25));
        geos.push(new THREE.BoxGeometry(0.06, 0.9, 0.06).translate(sx * (w / 2 + 0.2), y - h / 2 - 0.1, front + 0.85));
      }
      g.add(new THREE.Mesh(mergeGeometries(geos), metal));
      geos.forEach((geo) => geo.dispose());

      const material = new THREE.MeshBasicMaterial({ map: projectHoardingTexture({ index: i + 1, ...p }), color: new THREE.Color(0, 0, 0) });
      const face = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
      face.position.set(0, y, front + 0.67);
      g.add(face);

      // Neon tube along the catwalk edge, in the project color
      const stripMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color(0, 0, 0) });
      const strip = new THREE.Mesh(new THREE.BoxGeometry(w + 0.4, 0.06, 0.06), stripMaterial);
      strip.position.set(0, y - h / 2 - 0.47, front + 0.92);
      g.add(strip);

      this.boards.push({
        material,
        stripMaterial,
        stripColor: new THREE.Color(p.color).multiplyScalar(1.8),
        onAt: p.onAt,
        focus: p.focus,
        startedAt: -1,
        flick: i * 2.7,
      });
    });
  }

  update(time, dt, s) {
    for (const b of this.boards) {
      // Switch on once the story reaches the board, then run on time so it always finishes
      if (s > b.onAt) {
        if (b.startedAt < 0) b.startedAt = time;
      } else if (s < b.onAt - 0.05) {
        b.startedAt = -1;
      }
      const elapsed = b.startedAt < 0 ? -1 : time - b.startedAt;
      let on = 0.06;
      if (elapsed >= 0) {
        const ramp = this.reducedMotion ? 1 : smoothstep(0, ON_DURATION, elapsed);
        const stutter = ramp < 1 ? (Math.sin(time * 60 + b.flick) > 0.1 ? 1 : 0.15) : 1;
        on = Math.max(0.06, ramp * stutter);
      }
      // Boards the camera has moved past dim down, so they don't compete with the text column
      const focus = 0.06 + 0.94 * band(s, ...b.focus);
      const hum = 0.9 + Math.sin(time * 1.4 + b.flick) * 0.03;
      b.material.color.setScalar(on * hum * focus);
      b.stripMaterial.color.copy(b.stripColor).multiplyScalar(on);
    }
  }
}
