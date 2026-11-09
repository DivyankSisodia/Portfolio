import * as THREE from 'three';

/**
 * World layout shared by every set piece and the camera rig.
 * Units are roughly meters. x right, y up, the camera starts at +z looking toward -z.
 */
export const LAYOUT = {
  street: {
    halfRoad: 6,
    halfWalk: 8,
    zMin: -26,
    zMax: 92,
  },
  // Building at the end of the street that carries the name sign and hides the AI hall
  ds: {
    xMin: -16,
    xMax: 16,
    zFront: -28,
    zBack: -70,
    height: 44,
    door: { halfWidth: 4, height: 6.2 },
  },
  store: {
    facadeX: 8,
    backX: 16,
    zMin: -11,
    zMax: -1,
    height: 5,
    bottle: new THREE.Vector3(11.5, 0, -6),
  },
  hall: {
    core: new THREE.Vector3(0, 6.5, -56),
  },
  // Chapter 3: three skyscrapers right of the name building, each turned toward `facing`
  // (where the chapter 3 camera rises) with a project hoarding on its front facade.
  // `w` runs along the front face, `d` is the depth behind it.
  projects: {
    // Towers sit on bearings about 20 degrees apart from `facing`, so none hides another.
    // The right-hand blocks in front of them are kept low or left out (see City).
    facing: new THREE.Vector3(10, 15, -16),
    towers: [
      { x: 28, z: -33, w: 14, d: 10, h: 60, board: { y: 13, w: 13, h: 6.5 } },
      { x: 53, z: -30, w: 16, d: 10, h: 76, board: { y: 19, w: 14, h: 7 } },
      { x: 61, z: -13, w: 17, d: 11, h: 92, board: { y: 25, w: 15, h: 7.5 } },
    ],
  },
  roof: {
    y: 44,
    // Opening above the atrium that the camera rises through
    hole: { xMin: -6.5, xMax: 6.5, zMin: -63, zMax: -49.5 },
    // Career tower and sakura tree sit right of the text in the final shot.
    // The tower faces `towerFacing` (the final camera position in CameraRig).
    tower: new THREE.Vector3(-1.9, 44, -33.5),
    towerFacing: new THREE.Vector3(2.0, 44, -50),
    tree: new THREE.Vector3(-5.8, 44, -37.6),
  },
  // Skills billboard (AI / FULL STACK / RAG / ML), mounted off the right facade and angled toward
  // the arriving camera. `side` is -1 for left, 1 for right; City keeps that block tall and sign-free.
  billboard: {
    side: 1,
    position: new THREE.Vector3(6.4, 11, 18),
    rotationY: -0.82,
  },
};

/** Yaw that turns a project tower's front (+z) face toward LAYOUT.projects.facing. */
export function projectTowerYaw(t) {
  const f = LAYOUT.projects.facing;
  return Math.atan2(f.x - t.x, f.z - t.z);
}
