/**
 * generate-icons.js
 *
 * Run with Node.js (requires "canvas" package) to generate all
 * PNG icon variants needed by the PWA manifest:
 *
 *   npm install canvas
 *   node icons/generate-icons.js
 *
 * Outputs (into the icons/ directory):
 *   icon-48.png, icon-72.png, icon-96.png, icon-128.png,
 *   icon-192.png, icon-512.png
 *   icon-maskable-192.png, icon-maskable-512.png
 *
 * The maskable icons include a "safe-zone" background so the
 * icon displays correctly when circular masks are applied on
 * Android and ChromeOS.
 *
 * Apple Touch Icon is also written as apple-touch-icon.png (180×180).
 */

'use strict';

const { createCanvas } = require('canvas');
const fs               = require('fs');
const path             = require('path');

const OUT_DIR = __dirname;          // icons/ directory

const SIZES    = [48, 72, 96, 128, 192, 512];
const MASKABLE = [192, 512];

/** Draw the Saints & Wisdom icon onto a canvas context */
function drawIcon(ctx, size, maskable = false) {
  const cx = size / 2;
  const cy = size / 2;

  // ── Background ────────────────────────────────────────────
  if (maskable) {
    // Solid background filling the entire square (required for maskable icons)
    const grad = ctx.createLinearGradient(0, 0, size, size);
    grad.addColorStop(0,   '#1e1b4b');
    grad.addColorStop(0.5, '#4c1d95');
    grad.addColorStop(1,   '#1e1b4b');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  } else {
    // Rounded rect background (matches the icon shape on most launchers)
    const r = size * 0.2;
    const grad = ctx.createLinearGradient(0, 0, size, size);
    grad.addColorStop(0,   '#1e1b4b');
    grad.addColorStop(0.5, '#4c1d95');
    grad.addColorStop(1,   '#1e1b4b');
    ctx.fillStyle = grad;
    roundRect(ctx, 0, 0, size, size, r);
    ctx.fill();
  }

  // ── Halo / glow ────────────────────────────────────────────
  const haloR = size * (maskable ? 0.33 : 0.36);
  const halo  = ctx.createRadialGradient(cx, cy, 0, cx, cy, haloR);
  halo.addColorStop(0,   'rgba(139,92,246,0.55)');
  halo.addColorStop(1,   'rgba(139,92,246,0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(cx, cy, haloR, 0, Math.PI * 2);
  ctx.fill();

  // ── Cross symbol ────────────────────────────────────────────
  const unit   = size / 12;
  const thick  = Math.max(2, unit * 0.9);
  ctx.fillStyle   = '#f8fafc';
  ctx.shadowColor = 'rgba(139,92,246,0.8)';
  ctx.shadowBlur  = size * 0.04;

  // Vertical bar
  ctx.fillRect(cx - thick / 2, cy - unit * 2.6, thick, unit * 5.2);
  // Horizontal bar
  ctx.fillRect(cx - unit * 1.8, cy - unit * 0.9, unit * 3.6, thick);

  ctx.shadowBlur = 0;

  // ── Decorative stars ─────────────────────────────────────────
  if (size >= 96) {
    const starSize = Math.max(2, size * 0.045);
    const offsets  = [
      [-unit * 2.8,  unit * 1.8],
      [ unit * 2.8,  unit * 1.8],
      [ 0,          -unit * 3.2],
    ];
    ctx.fillStyle = 'rgba(245,158,11,0.85)';
    offsets.forEach(([dx, dy]) => drawStar(ctx, cx + dx, cy + dy, starSize));
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawStar(ctx, cx, cy, r) {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
}

/** Write a PNG for the given size */
function writeIcon(size, maskable = false) {
  const canvas  = createCanvas(size, size);
  const ctx     = canvas.getContext('2d');
  drawIcon(ctx, size, maskable);

  const prefix = maskable ? 'icon-maskable-' : 'icon-';
  const file   = path.join(OUT_DIR, `${prefix}${size}.png`);
  fs.writeFileSync(file, canvas.toBuffer('image/png'));
  console.log(`Written: ${file}`);
}

// Generate all variants
SIZES.forEach(s   => writeIcon(s, false));
MASKABLE.forEach(s => writeIcon(s, true));

// Apple Touch Icon (180×180, non-maskable)
const appleCanvas = createCanvas(180, 180);
drawIcon(appleCanvas.getContext('2d'), 180, false);
fs.writeFileSync(path.join(OUT_DIR, 'apple-touch-icon.png'), appleCanvas.toBuffer('image/png'));
console.log('Written: apple-touch-icon.png');

console.log('\nAll icons generated successfully.');
