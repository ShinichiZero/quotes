/**
 * platform.js — Detect display mode & Service Worker status
 * Runs after DOMContentLoaded via module import in index.html
 */

// Detect PWA display mode
const modes = ['window-controls-overlay', 'standalone', 'minimal-ui', 'browser'];
const mode  = modes.find(m => window.matchMedia(`(display-mode: ${m})`).matches) || 'browser';
const modeEl = document.getElementById('display-mode');
if (modeEl) {
  modeEl.textContent = mode.charAt(0).toUpperCase() + mode.slice(1);
}

// Service Worker status
const swEl = document.getElementById('sw-status');
if (swEl) {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready
      .then(() => { swEl.textContent = '✅ Active'; })
      .catch(()  => { swEl.textContent = '⚠️ Unavailable'; });
  } else {
    swEl.textContent = '❌ Not supported';
  }
}
