import * as THREE from 'three';
import { createRandom, PALETTE } from './utils.js';

const FONT_DISPLAY = '"Space Grotesk", system-ui, sans-serif';
const FONT_MONO = '"JetBrains Mono", ui-monospace, Menlo, monospace';
const FONT_NEON = '"Orbitron", "Space Grotesk", sans-serif';
const FONT_JP = '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic", "Meiryo", "Noto Sans JP", sans-serif';

let maxAnisotropy = 4;
export function setMaxAnisotropy(value) {
  maxAnisotropy = Math.max(1, Math.min(8, value));
}

export function makeCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  return { canvas, ctx };
}

export function toTexture(canvas, { mipmaps = true } = {}) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = maxAnisotropy;
  texture.generateMipmaps = mipmaps;
  texture.minFilter = mipmaps ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Draws text as a neon tube: wide colored glow, tighter glow, then a pale hot core. */
function neonText(ctx, text, x, y, { font, color, core = '#ffffff', blur = 24, spacing = '0px' }) {
  ctx.save();
  ctx.font = font;
  ctx.letterSpacing = spacing;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = blur * 2.2;
  ctx.fillText(text, x, y);
  ctx.shadowBlur = blur;
  ctx.fillText(text, x, y);
  ctx.shadowBlur = blur * 0.35;
  ctx.fillStyle = core;
  ctx.fillText(text, x, y);
  ctx.restore();
}

function neonStroke(ctx, drawPath, { color, width = 4, blur = 20 }) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
  drawPath();
  ctx.stroke();
  ctx.shadowBlur = blur * 0.4;
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = Math.max(1, width * 0.4);
  drawPath();
  ctx.stroke();
  ctx.restore();
}

/* -------------------------------------------------------------------------- */
/* Hero sign: "DIVYANK / SISODIA"                                              */
/* -------------------------------------------------------------------------- */

export function heroSignTexture() {
  const { canvas, ctx } = makeCanvas(2048, 1024);
  const color = '#c9a6ff';
  neonText(ctx, 'DIVYANK', 1024, 330, { font: `800 300px ${FONT_NEON}`, color, core: '#f7f0ff', blur: 34, spacing: '24px' });
  neonText(ctx, 'SISODIA', 1024, 700, { font: `800 300px ${FONT_NEON}`, color, core: '#f7f0ff', blur: 34, spacing: '24px' });
  return toTexture(canvas);
}

export function neonWordTexture(
  word,
  { color = PALETTE.pink, width = 2048, height = 512, size = 300, frame = false, spacing = 0.08 } = {},
) {
  const { canvas, ctx } = makeCanvas(width, height);
  if (frame) {
    neonStroke(ctx, () => roundRect(ctx, 40, 40, width - 80, height - 80, 36), { color, width: 10, blur: 30 });
  }
  // Shrink the font if the word plus its glow would run past the canvas edge (that clips the glow)
  const blur = 30;
  const pad = blur * 2.2 + 24;
  let px = size;
  ctx.save();
  for (let i = 0; i < 8; i++) {
    ctx.font = `800 ${px}px ${FONT_NEON}`;
    ctx.letterSpacing = `${Math.round(px * spacing)}px`;
    if (ctx.measureText(word).width <= width - pad * 2) break;
    px *= 0.93;
  }
  ctx.restore();
  // letterSpacing also adds space after the last letter; shift by half of it to stay centred
  neonText(ctx, word, width / 2 + Math.round(px * spacing) / 2, height / 2 + px * 0.04, {
    font: `800 ${px}px ${FONT_NEON}`,
    color,
    core: '#fff3f8',
    blur,
    spacing: `${Math.round(px * spacing)}px`,
  });
  return toTexture(canvas);
}

/* -------------------------------------------------------------------------- */
/* Sign atlas for the city                                                     */
/* -------------------------------------------------------------------------- */

const VERTICAL_SIGNS = ['ラーメン', 'カラオケ', 'ホテル', '電脳街', '未来', 'ソフトウェア', 'データ', '人工知能', '夜市', '居酒屋', 'コード', '雨音'];
const HORIZONTAL_SIGNS = [
  'RAMEN',
  'HOTEL',
  'OPEN 24H',
  'NODE.JS',
  'REACT',
  'PYTHON',
  'REDIS',
  'POSTGRES',
  'AWS',
  'AZURE',
  'LLM BAR',
  'RAG',
  'NEON',
  'ARCADE',
  'MCP',
  'CLOUD 9',
  'KARAOKE',
  'GPU',
];

/**
 * Packs ~30 sign designs into one texture. Each rect stores its UVs and aspect ratio,
 * so the city can place many instanced sign quads with a single draw call.
 */
export function signAtlasTexture(seed = 7) {
  const rng = createRandom(seed);
  const size = 2048;
  const { canvas, ctx } = makeCanvas(size, size);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, size, size);

  const colors = [PALETTE.pink, PALETTE.cyan, PALETTE.violet, PALETTE.red, PALETTE.amber, PALETTE.pink, PALETTE.cyan];
  const defs = [];
  VERTICAL_SIGNS.forEach((text) => defs.push({ text, vertical: true, w: 150, h: Math.max(330, text.length * 96 + 60) }));
  HORIZONTAL_SIGNS.forEach((text) => defs.push({ text, vertical: false, w: Math.max(300, text.length * 58 + 90), h: 150 }));

  // Shelf packing, tallest first
  defs.sort((a, b) => b.h - a.h);
  const pad = 12;
  let x = pad;
  let y = pad;
  let shelf = 0;
  const rects = [];
  for (const def of defs) {
    if (x + def.w + pad > size) {
      x = pad;
      y += shelf + pad;
      shelf = 0;
    }
    if (y + def.h + pad > size) break;
    const color = rng.pick(colors);
    const style = rng.chance(0.28) ? 'box' : 'tube';
    drawSign(ctx, def, x, y, color, style);
    rects.push({
      u: x / size,
      v: 1 - (y + def.h) / size,
      w: def.w / size,
      h: def.h / size,
      aspect: def.w / def.h,
      vertical: def.vertical,
      color,
    });
    x += def.w + pad;
    shelf = Math.max(shelf, def.h);
  }
  const texture = toTexture(canvas);
  return { texture, rects };
}

function drawSign(ctx, def, x, y, color, style) {
  const { w, h, text, vertical } = def;
  ctx.save();
  if (style === 'box') {
    // Backlit lightbox: bright panel, dark lettering
    const grad = ctx.createLinearGradient(x, y, x, y + h);
    grad.addColorStop(0, color);
    grad.addColorStop(1, shade(color, 0.55));
    ctx.fillStyle = grad;
    roundRect(ctx, x, y, w, h, 10);
    ctx.fill();
    ctx.fillStyle = 'rgba(8,4,14,0.92)';
    drawSignText(ctx, def, x, y, '#0a0610', false);
  } else {
    ctx.fillStyle = '#07050c';
    roundRect(ctx, x, y, w, h, 10);
    ctx.fill();
    neonStroke(ctx, () => roundRect(ctx, x + 8, y + 8, w - 16, h - 16, 8), { color, width: 4, blur: 14 });
    drawSignText(ctx, def, x, y, color, true);
  }
  ctx.restore();

  function drawSignText(c, d, sx, sy, fill, glow) {
    if (vertical) {
      const chars = [...text].map((ch) => (ch === 'ー' ? '｜' : ch));
      const step = (h - 60) / chars.length;
      const fs = Math.min(92, step * 0.92, w * 0.66);
      chars.forEach((ch, i) => {
        const cy = sy + 30 + step * (i + 0.5);
        if (glow) neonText(c, ch, sx + w / 2, cy, { font: `700 ${fs}px ${FONT_JP}`, color: fill, blur: 16 });
        else {
          c.font = `800 ${fs}px ${FONT_JP}`;
          c.textAlign = 'center';
          c.textBaseline = 'middle';
          c.fillStyle = fill;
          c.fillText(ch, sx + w / 2, cy);
        }
      });
    } else {
      const fs = Math.min(84, (w - 70) / (text.length * 0.72));
      if (glow) neonText(c, text, sx + w / 2, sy + h / 2 + 4, { font: `800 ${fs}px ${FONT_NEON}`, color: fill, blur: 16, spacing: '4px' });
      else {
        c.font = `800 ${fs}px ${FONT_NEON}`;
        c.letterSpacing = '4px';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillStyle = fill;
        c.fillText(text, sx + w / 2, sy + h / 2 + 4);
      }
    }
  }
}

function shade(hex, f) {
  const c = new THREE.Color(hex);
  c.multiplyScalar(f);
  return `#${c.getHexString()}`;
}

/* -------------------------------------------------------------------------- */
/* Holographic billboard slides (skills ad)                                    */
/* -------------------------------------------------------------------------- */

const SLIDES = [
  { big: 'AI', small: '/ GENAI', sub: 'RAG · AGENTS · MCP', color: '#b06bff' },
  { big: 'FULL', small: 'STACK', sub: 'REACT · NODE · POSTGRES', color: '#ff3d9a' },
  { big: 'RAG', small: 'SEARCH', sub: 'RETRIEVE · RANK · ANSWER', color: '#3ff0ff' },
  { big: 'ML', small: 'RANKING', sub: 'RECALL@10 0.40 → 0.64', color: '#ff2e4d' },
];

/** Four portrait slides stacked vertically in one texture; the shader picks one. */
export function billboardTexture() {
  const sw = 512;
  const sh = 704;
  const { canvas, ctx } = makeCanvas(sw, sh * SLIDES.length);
  const rng = createRandom(99);
  SLIDES.forEach((slide, i) => {
    const y0 = i * sh;
    const bg = ctx.createLinearGradient(0, y0, sw, y0 + sh);
    bg.addColorStop(0, shade(slide.color, 0.35));
    bg.addColorStop(0.55, '#120821');
    bg.addColorStop(1, shade(slide.color, 0.22));
    ctx.fillStyle = bg;
    ctx.fillRect(0, y0, sw, sh);

    // Concentric "neural" rings and nodes
    ctx.save();
    ctx.translate(sw * 0.56, y0 + sh * 0.4);
    for (let r = 40; r < 330; r += 34) {
      ctx.strokeStyle = `rgba(255,255,255,${0.05 + (r % 68 === 40 ? 0.06 : 0)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (let n = 0; n < 26; n++) {
      const a = rng.next() * Math.PI * 2;
      const r = 50 + rng.next() * 260;
      ctx.fillStyle = slide.color;
      ctx.shadowColor = slide.color;
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * r, Math.sin(a) * r, 3 + rng.next() * 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    neonText(ctx, slide.big, sw / 2, y0 + sh * 0.4, { font: `900 ${slide.big.length > 3 ? 150 : 210}px ${FONT_NEON}`, color: slide.color, core: '#fff', blur: 30 });
    neonText(ctx, slide.small, sw / 2, y0 + sh * 0.62, { font: `700 54px ${FONT_NEON}`, color: slide.color, core: '#fff', blur: 18, spacing: '8px' });
    ctx.font = `500 22px ${FONT_MONO}`;
    ctx.letterSpacing = '3px';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillText(slide.sub, sw / 2, y0 + sh * 0.76);

    // Vertical katakana strip on the left edge
    const jp = [...'ソフトウェア'];
    jp.forEach((ch, k) => {
      neonText(ctx, ch, 46, y0 + 90 + k * 78, { font: `700 52px ${FONT_JP}`, color: '#ff8fd0', blur: 10 });
    });
    ctx.font = `500 18px ${FONT_MONO}`;
    ctx.letterSpacing = '4px';
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillText('DIVYANK.DEV', sw / 2, y0 + sh - 44);
  });
  const texture = toTexture(canvas);
  return { texture, count: SLIDES.length };
}

/* -------------------------------------------------------------------------- */
/* Parfame holographic UI                                                      */
/* -------------------------------------------------------------------------- */

export function createParfameUI() {
  const W = 1024;
  const H = 680;
  const { canvas, ctx } = makeCanvas(W, H);
  const texture = toTexture(canvas, { mipmaps: false });
  const pink = '#ff4fa8';
  const prices = [4890, 4720, 4980, 4510, 4300, 4420, 3990, 4100, 3720, 3580, 3410, 3249];
  const query = 'Find a fragrance...';

  function draw(typed = query.length) {
    ctx.clearRect(0, 0, W, H);
    // Panel
    ctx.fillStyle = 'rgba(255, 70, 160, 0.09)';
    roundRect(ctx, 16, 16, W - 32, H - 32, 30);
    ctx.fill();
    neonStroke(ctx, () => roundRect(ctx, 16, 16, W - 32, H - 32, 30), { color: pink, width: 4, blur: 18 });

    // Search bar
    ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
    roundRect(ctx, 56, 56, W - 112, 92, 46);
    ctx.fill();
    neonStroke(ctx, () => roundRect(ctx, 56, 56, W - 112, 92, 46), { color: pink, width: 2.5, blur: 10 });
    neonStroke(
      ctx,
      () => {
        ctx.beginPath();
        ctx.arc(112, 100, 17, 0, Math.PI * 2);
        ctx.moveTo(124, 112);
        ctx.lineTo(138, 126);
      },
      { color: pink, width: 4, blur: 8 },
    );
    ctx.font = `500 36px ${FONT_DISPLAY}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255, 235, 245, 0.92)';
    const shown = query.slice(0, typed);
    ctx.fillText(shown, 164, 102);
    if (typed < query.length || Math.floor(performance.now() / 500) % 2 === 0) {
      const tw = ctx.measureText(shown).width;
      ctx.fillStyle = pink;
      ctx.fillRect(168 + tw, 80, 3, 44);
    }

    // Chart header
    ctx.font = `600 22px ${FONT_MONO}`;
    ctx.letterSpacing = '3px';
    ctx.fillStyle = 'rgba(255, 200, 230, 0.75)';
    ctx.fillText('PRICE HISTORY · 100 ML', 64, 200);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#fff';
    ctx.font = `700 40px ${FONT_NEON}`;
    ctx.letterSpacing = '0px';
    ctx.fillText('₹3,249', W - 64, 204);
    ctx.textAlign = 'left';
    ctx.letterSpacing = '0px';

    // Chart
    const cx = 64;
    const cy = 240;
    const cw = W - 128;
    const ch = 250;
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    for (let g = 0; g <= 4; g++) {
      ctx.beginPath();
      ctx.moveTo(cx, cy + (ch / 4) * g);
      ctx.lineTo(cx + cw, cy + (ch / 4) * g);
      ctx.stroke();
    }
    const min = 3000;
    const max = 5200;
    const pts = prices.map((p, i) => [cx + (cw / (prices.length - 1)) * i, cy + ch - ((p - min) / (max - min)) * ch]);
    const fill = ctx.createLinearGradient(0, cy, 0, cy + ch);
    fill.addColorStop(0, 'rgba(255, 79, 168, 0.45)');
    fill.addColorStop(1, 'rgba(255, 79, 168, 0)');
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], cy + ch);
    pts.forEach(([px, py]) => ctx.lineTo(px, py));
    ctx.lineTo(pts[pts.length - 1][0], cy + ch);
    ctx.closePath();
    ctx.fill();
    neonStroke(
      ctx,
      () => {
        ctx.beginPath();
        pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
      },
      { color: pink, width: 5, blur: 16 },
    );
    const last = pts[pts.length - 1];
    ctx.fillStyle = '#fff';
    ctx.shadowColor = pink;
    ctx.shadowBlur = 20;
    ctx.beginPath();
    ctx.arc(last[0], last[1], 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Footer: retailer count + "smells similar" matches
    ctx.font = `500 22px ${FONT_MONO}`;
    ctx.letterSpacing = '2px';
    ctx.fillStyle = 'rgba(255, 220, 238, 0.8)';
    ctx.fillText('40 RETAILERS COMPARED · LOWEST TODAY', 64, 540);
    const matches = [
      ['AMBER OUD', '92%'],
      ['VANILLA NOIR', '88%'],
      ['ROSE SMOKE', '85%'],
    ];
    matches.forEach(([name, pct], i) => {
      const bx = 64 + i * 304;
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      roundRect(ctx, bx, 568, 284, 62, 14);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 79, 168, 0.5)';
      ctx.lineWidth = 2;
      roundRect(ctx, bx, 568, 284, 62, 14);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.font = `600 20px ${FONT_MONO}`;
      ctx.fillText(name, bx + 18, 600);
      ctx.textAlign = 'right';
      ctx.fillStyle = pink;
      ctx.fillText(pct, bx + 266, 600);
      ctx.textAlign = 'left';
    });
    ctx.letterSpacing = '0px';
    texture.needsUpdate = true;
  }

  draw(0);
  return { texture, draw, length: query.length };
}

/* -------------------------------------------------------------------------- */
/* Documents for the RAG hall                                                  */
/* -------------------------------------------------------------------------- */

const DOCS = [
  ['handbook.pdf', 'chunk 12/48', '0.91'],
  ['api-spec.md', 'chunk 3/19', '0.88'],
  ['listings.csv', 'rows 4.2k', '0.84'],
  ['runbook.md', 'chunk 7/22', '0.82'],
  ['schema.sql', 'tables 31', '0.79'],
  ['pricing.json', 'items 40', '0.77'],
];

export function documentTexture(index) {
  const [name, meta, score] = DOCS[index % DOCS.length];
  const rng = createRandom(31 + index * 7);
  const W = 512;
  const H = 640;
  const { canvas, ctx } = makeCanvas(W, H);
  const cyan = '#62e6ff';
  ctx.fillStyle = 'rgba(40, 150, 255, 0.10)';
  roundRect(ctx, 10, 10, W - 20, H - 20, 18);
  ctx.fill();
  neonStroke(ctx, () => roundRect(ctx, 10, 10, W - 20, H - 20, 18), { color: cyan, width: 3, blur: 14 });

  // Doc icon
  neonStroke(
    ctx,
    () => {
      ctx.beginPath();
      ctx.moveTo(44, 40);
      ctx.lineTo(90, 40);
      ctx.lineTo(108, 58);
      ctx.lineTo(108, 118);
      ctx.lineTo(44, 118);
      ctx.closePath();
    },
    { color: cyan, width: 3, blur: 10 },
  );
  ctx.font = `600 30px ${FONT_MONO}`;
  ctx.fillStyle = '#e6fbff';
  ctx.textBaseline = 'middle';
  ctx.fillText(name, 130, 64);
  ctx.font = `400 20px ${FONT_MONO}`;
  ctx.fillStyle = 'rgba(160, 230, 255, 0.7)';
  ctx.fillText(`${meta} · score ${score}`, 130, 100);

  // Lines of text, a few highlighted as the "retrieved" passage
  let y = 160;
  const hiStart = 3 + Math.floor(rng.next() * 6);
  for (let i = 0; i < 16; i++) {
    const w = 180 + rng.next() * 250;
    const hi = i >= hiStart && i < hiStart + 3;
    ctx.fillStyle = hi ? 'rgba(120, 245, 255, 0.95)' : 'rgba(150, 210, 255, 0.4)';
    if (hi) {
      ctx.shadowColor = cyan;
      ctx.shadowBlur = 12;
    }
    roundRect(ctx, 44, y, w, 11, 5);
    ctx.fill();
    ctx.shadowBlur = 0;
    y += 26;
  }
  ctx.font = `400 17px ${FONT_MONO}`;
  ctx.fillStyle = 'rgba(160, 230, 255, 0.55)';
  ctx.fillText('emb [0.12, -0.44, 0.83, …]', 44, H - 44);
  return toTexture(canvas);
}

/* -------------------------------------------------------------------------- */
/* Monitor code screen                                                         */
/* -------------------------------------------------------------------------- */

export function codeTexture() {
  const W = 640;
  const H = 400;
  const { canvas, ctx } = makeCanvas(W, H);
  ctx.fillStyle = '#04070d';
  ctx.fillRect(0, 0, W, H);
  const lines = [
    [['#9b8cff', 'const '], ['#e8f0ff', 'docs = '], ['#ff6fa8', 'await '], ['#62e6ff', 'retriever.search'], ['#e8f0ff', '(q, { k: 8 });']],
    [['#9b8cff', 'const '], ['#e8f0ff', 'context = '], ['#62e6ff', 'rerank'], ['#e8f0ff', '(docs).slice(0, 4);']],
    [['#9b8cff', 'const '], ['#e8f0ff', 'answer = '], ['#ff6fa8', 'await '], ['#62e6ff', 'llm.generate'], ['#e8f0ff', '({']],
    [['#e8f0ff', '  system: '], ['#ffb347', 'GUARDRAILS'], ['#e8f0ff', ',']],
    [['#e8f0ff', '  tools: '], ['#ffb347', 'ALLOWLIST'], ['#e8f0ff', ',']],
    [['#e8f0ff', '  prompt: '], ['#62e6ff', 'build'], ['#e8f0ff', '(q, context),']],
    [['#e8f0ff', '});']],
    [['#6b7894', '// cache hot reads, spare postgres']],
    [['#ff6fa8', 'await '], ['#62e6ff', 'redis.set'], ['#e8f0ff', '(key, answer, '], ['#39ff9f', "'EX'"], ['#e8f0ff', ', 300);']],
    [['#9b8cff', 'return '], ['#e8f0ff', '{ answer, sources };']],
  ];
  ctx.font = `500 21px ${FONT_MONO}`;
  ctx.textBaseline = 'top';
  lines.forEach((parts, i) => {
    let x = 26;
    ctx.fillStyle = '#3a4560';
    ctx.fillText(String(i + 1).padStart(2, ' '), x, 24 + i * 34);
    x += 44;
    parts.forEach(([color, text]) => {
      ctx.fillStyle = color;
      ctx.fillText(text, x, 24 + i * 34);
      x += ctx.measureText(text).width;
    });
  });
  return toTexture(canvas);
}

export function ledRackTexture(seed = 3) {
  const rng = createRandom(seed);
  const W = 256;
  const H = 512;
  const { canvas, ctx } = makeCanvas(W, H);
  ctx.fillStyle = '#07090d';
  ctx.fillRect(0, 0, W, H);
  for (let row = 0; row < 24; row++) {
    const y = 12 + row * 21;
    ctx.fillStyle = '#0d1118';
    ctx.fillRect(10, y, W - 20, 17);
    for (let k = 0; k < 6; k++) {
      if (!rng.chance(0.7)) continue;
      const color = rng.pick(['#39ff9f', '#3ff0ff', '#3ff0ff', '#ffb347', '#ff2e4d']);
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 6;
      ctx.fillRect(20 + k * 12, y + 6, 6, 5);
      ctx.shadowBlur = 0;
    }
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fillRect(110, y + 5, 120, 7);
  }
  return toTexture(canvas);
}

/* -------------------------------------------------------------------------- */
/* Rooftop company panels                                                      */
/* -------------------------------------------------------------------------- */

export function companyPanelTexture({ name, role, dates, color = PALETTE.pink }) {
  const W = 1024;
  const H = 512;
  const { canvas, ctx } = makeCanvas(W, H);
  ctx.fillStyle = '#0a0612';
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, W * 0.6);
  glow.addColorStop(0, 'rgba(255, 60, 140, 0.16)');
  glow.addColorStop(1, 'rgba(255, 60, 140, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  neonStroke(ctx, () => roundRect(ctx, 28, 28, W - 56, H - 56, 18), { color, width: 6, blur: 22 });

  const lines = name.split('\n');
  const size = lines.length > 1 ? 88 : 104;
  lines.forEach((line, i) => {
    neonText(ctx, line, W / 2, H / 2 - 40 + (i - (lines.length - 1) / 2) * size * 1.05, {
      font: `600 ${size}px ${FONT_DISPLAY}`,
      color: '#ff9fcf',
      core: '#ffffff',
      blur: 18,
    });
  });
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `500 30px ${FONT_MONO}`;
  ctx.letterSpacing = '3px';
  ctx.fillStyle = 'rgba(255, 230, 245, 0.85)';
  ctx.fillText(role.toUpperCase(), W / 2, H - 132);
  ctx.fillStyle = color;
  ctx.font = `600 28px ${FONT_MONO}`;
  ctx.fillText(dates.toUpperCase(), W / 2, H - 86);
  return toTexture(canvas);
}

/* -------------------------------------------------------------------------- */
/* Chapter 3 project hoardings                                                 */
/* -------------------------------------------------------------------------- */

function wrapLines(ctx, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export function projectHoardingTexture({ index, name, where, desc, tags, color }) {
  const W = 1024;
  const H = 512;
  const { canvas, ctx } = makeCanvas(W, H);
  ctx.fillStyle = '#07060d';
  ctx.fillRect(0, 0, W, H);
  const tint = new THREE.Color(color);
  const rgba = (a) => `rgba(${Math.round(tint.r * 255)}, ${Math.round(tint.g * 255)}, ${Math.round(tint.b * 255)}, ${a})`;
  const glow = ctx.createLinearGradient(0, 0, W, H);
  glow.addColorStop(0, rgba(0.16));
  glow.addColorStop(1, rgba(0.02));
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  // Faint scanlines
  ctx.fillStyle = 'rgba(255, 255, 255, 0.025)';
  for (let y = 0; y < H; y += 6) ctx.fillRect(0, y, W, 2);
  neonStroke(ctx, () => roundRect(ctx, 22, 22, W - 44, H - 44, 14), { color, width: 5, blur: 18 });

  const left = 70;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.letterSpacing = '4px';
  ctx.font = `600 24px ${FONT_MONO}`;
  ctx.fillStyle = color;
  ctx.fillText(`PROJECT ${String(index).padStart(2, '0')}  ·  ${where.toUpperCase()}`, left, 94);

  // Title as a neon tube, left aligned
  ctx.save();
  ctx.font = `700 76px ${FONT_DISPLAY}`;
  ctx.letterSpacing = '0px';
  const titleLines = wrapLines(ctx, name, W - left * 2);
  titleLines.forEach((line, i) => {
    const y = 172 + i * 78;
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 34;
    ctx.fillText(line, left, y);
    ctx.shadowBlur = 8;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(line, left, y);
  });
  ctx.restore();

  const descTop = 172 + titleLines.length * 78 + 4;
  ctx.font = `400 30px ${FONT_DISPLAY}`;
  ctx.letterSpacing = '0px';
  ctx.fillStyle = 'rgba(236, 232, 255, 0.86)';
  wrapLines(ctx, desc, W - left * 2)
    .slice(0, titleLines.length > 1 ? 2 : 3)
    .forEach((line, i) => ctx.fillText(line, left, descTop + i * 40));

  // Tag chips along the bottom
  ctx.font = `500 22px ${FONT_MONO}`;
  ctx.letterSpacing = '1px';
  let x = left;
  const chipY = H - 96;
  for (const tag of tags) {
    const w = ctx.measureText(tag).width + 32;
    ctx.strokeStyle = rgba(0.7);
    ctx.lineWidth = 2;
    roundRect(ctx, x, chipY, w, 40, 20);
    ctx.stroke();
    ctx.fillStyle = 'rgba(245, 242, 255, 0.9)';
    ctx.fillText(tag, x + 16, chipY + 28);
    x += w + 14;
  }
  return toTexture(canvas);
}

/* -------------------------------------------------------------------------- */
/* Misc                                                                        */
/* -------------------------------------------------------------------------- */

export function bottleLabelTexture() {
  const { canvas, ctx } = makeCanvas(512, 256);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 82px ${FONT_NEON}`;
  ctx.letterSpacing = '10px';
  ctx.fillStyle = 'rgba(255, 236, 214, 0.95)';
  ctx.fillText('PARFAME', 256, 110);
  ctx.font = `500 26px ${FONT_MONO}`;
  ctx.letterSpacing = '8px';
  ctx.fillStyle = 'rgba(255, 236, 214, 0.7)';
  ctx.fillText('EAU DE PARFUM', 256, 180);
  return toTexture(canvas);
}

/** Wait for web fonts used by canvas textures, with a timeout so we never hang. */
export async function loadCanvasFonts() {
  if (!document.fonts || !document.fonts.load) return;
  const fonts = [
    `800 100px ${FONT_NEON}`,
    `900 100px ${FONT_NEON}`,
    `700 100px ${FONT_NEON}`,
    `500 40px ${FONT_DISPLAY}`,
    `600 40px ${FONT_DISPLAY}`,
    `500 20px ${FONT_MONO}`,
    `600 20px ${FONT_MONO}`,
  ];
  const timeout = new Promise((resolve) => setTimeout(resolve, 2500));
  await Promise.race([Promise.all(fonts.map((f) => document.fonts.load(f).catch(() => null))), timeout]);
}
