# Build notes: cinematic Three.js portfolio

Stack: Vite + vanilla three (0.187) + Lenis (smooth scroll) + @fontsource fonts. No framework.

Run: `npm install`, `npm run dev` (local), `npm run build` (outputs `dist/`), `npx vite preview` to serve the build.
Deep link any moment of the story with `?s=<story time>`, e.g. `/?s=2.22`.

## Story (scroll-driven, one continuous world)
Story time `s` comes from scroll: section i (200vh, sticky 100vh panel) maps to s in [i, i+1).
Pinned text: s in [i, i+0.5]. Last section ends at s = 3.5 (`STORY_END`).
Pace limit (`scroll.js`): wheel, touch (Lenis `syncTouch`) and Space/PageUp/PageDown/arrow input passes through a token bucket.
Max `MAX_STORY_PER_SECOND` = 0.35 (about 3 s per chapter) with a `BURST_VH` = 0.25 allowance, so slow scrolling is unchanged.
Excess input is dropped. Nav links, Home/End and scrollbar dragging are not limited. Dialogs carry `data-lenis-prevent`.
Camera keys live in `src/three/CameraRig.js` (CatmullRom over pos/target/fov). Wide screens use `filmOffset` so the subject sits right of the text.

| s | Scene |
|---|-------|
| 0.0-0.5 | 01 Arrival: neon street (mid-tone neon), "Divyank Sisodia" name sign on the end building, skills billboard on the right |
| 0.5-1.0 | turn right into the Parfame store |
| 1.0-1.5 | 02 Parfame: orbit the bottle. Bottle and holo chart are clickable (s 0.9-1.6) and open the shop dialog |
| 1.7-2.5 | 03 AI Systems: rise past three project skyscrapers on the right, each with a hoarding (flicker on at `onAt`, dim after `focus`) |
| ~2.6 | portal flash into the DS building |
| 2.6-3.0 | AI hall and atrium shaft (compressed) |
| 3.0-3.5 | 04 Rooftop: rise through `roof.hole`; career tower (MAQ, Abstrabit, Intech bottom to top) switches on from s > 2.93 |

## World layout (x right, y up, camera starts at +z looking -z)
- Main street along z, road |x|<6, sidewalks to |x|=8, buildings |x|>=8.
- Parfame store: facade x=8, room x[8,16] z[-11,-1]. Bottle at (11.5, 1.07, -6). Invisible hit box around it for taps.
- Project towers: `LAYOUT.projects` in `layout.js`; built as City instances (with `rotY`) plus `world/ProjectTowers.js` boards.
  Hoarding textures: `projectHoardingTexture()` in `textures.js`.
- Flying-car lane in `Life.js` is kept at y 33-38 so it never crosses the tower boards.
- Rooftop: y=44, roof slab with an opening the camera rises through. Rise keys are tilted to avoid a degenerate `lookAt` (the old jitter).
  The rooftop tree uses the blue sakura palette (`SAKURA_PALETTES` in `Sakura.js`); the street tree stays pink.
- Skills billboard: `LAYOUT.billboard` (`side: 1` = right). City keeps that block tall and keeps blade signs out of its view.
- Name sign: `neonWordTexture` shrinks the font until letters plus glow fit the canvas, so wider `spacing` never clips the edges.

## Interaction
- `src/shop.js`: Parfame shop dialog with a 2D canvas: price history (hover/arrow keys), retailer comparison, "smells similar" map
  (click/Enter switches scent), 50/100 ml toggle. Data is sample data, labelled as such in the UI.
- Opened by clicking the 3D bottle (price tab), the holo chart (compare tab) or the "Try the shop" button (keyboard, mobile, no-WebGL).
- `Experience.pick(ndcX, ndcY)` raycasts the store targets; `main.js` handles hover (pointer cursor, glow) and clicks.

## Rendering
- EffectComposer: RenderPass -> UnrealBloomPass (0.42, 0.4, 0.5) -> OutputPass -> FX pass (vignette, grain, aberration, flash).
- Ground: Reflector with custom shader. Buildings: one InstancedMesh with procedural windows.
- Quality tiers + adaptive pixel ratio. Reduced motion + no-WebGL fallback.

## Content
From resume. Phone number intentionally left off the public site (email only).
