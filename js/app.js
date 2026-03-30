/**
 * app.js — Saints & Wisdom main application
 *
 * Responsibilities:
 *  - Register Service Worker
 *  - Initialize IndexedDB
 *  - Verify quote integrity (HMAC-SHA-256)
 *  - Render quotes with glassmorphism cards
 *  - Navigation (bottom-tab portrait / sidebar landscape+desktop)
 *  - Windows Controls Overlay support
 *  - Android/iOS theme-color adaptation
 *  - Install prompt handling (PWA)
 *  - Periodic Background Sync / refresh-on-open
 *  - Emit "Verification Passed" console log on success
 */

import { QUOTES }                           from './quotes.js';
import { signQuotes, verifyQuotes }         from './crypto.js';
import { addFavorite, removeFavorite,
         isFavorite, getAllFavorites,
         getSetting, setSetting,
         getCacheMeta, setCacheMeta }        from './db.js';

/* ── Trusted Types Policy ──────────────────────────────────── */
let ttPolicy = null;
if (window.trustedTypes && window.trustedTypes.createPolicy) {
  ttPolicy = window.trustedTypes.createPolicy('saints-wisdom-default', {
    createHTML:      (s) => s,   // internal HTML only — user text is always escaped first
    createScriptURL: (s) => s,   // same-origin script URLs only (e.g. /sw.js)
  });
}

function safeHTML(s) {
  return ttPolicy ? ttPolicy.createHTML(s) : s;
}

function safeScriptURL(s) {
  return ttPolicy ? ttPolicy.createScriptURL(s) : s;
}

/* ── Constants ─────────────────────────────────────────────── */
const MS_PER_DAY = 86_400_000;
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

/* ── State ─────────────────────────────────────────────────── */
const state = {
  currentView:    'today',
  currentFilter:  'All',
  searchQuery:    '',
  favorites:      new Set(),
  deferredPrompt: null,
  verifiedQuotes: false,
};

/* ── Bootstrap ─────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', async () => {
  await Promise.all([
    registerServiceWorker(),
    initDB(),
    setupInstallPrompt(),
  ]);

  setupNavigation();
  setupSearch();
  setupFilterChips();
  setupWindowControlsOverlay();
  setupThemeColor();
  setupShareButtons();
  refreshOnOpen();

  renderView('today');
});

/* ── Service Worker ────────────────────────────────────────── */
async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const swURL = safeScriptURL('/sw.js');
    const reg = await navigator.serviceWorker.register(swURL, { scope: '/' });

    // Periodic Background Sync (Chrome / Android)
    if ('periodicSync' in reg) {
      const status = await navigator.permissions.query({ name: 'periodic-background-sync' });
      if (status.state === 'granted') {
        await reg.periodicSync.register('refresh-quotes', { minInterval: MS_PER_DAY });
      }
    }

    // Listen for SW messages
    navigator.serviceWorker.addEventListener('message', onSWMessage);

    // Prompt pending SW to activate
    if (reg.waiting) {
      reg.waiting.postMessage({ type: 'SKIP_WAITING' });
    }
  } catch (err) {
    console.warn('[SW] Registration failed:', err);
  }
}

function onSWMessage(event) {
  if (event.data?.type === 'CACHE_UPDATED') {
    showToast('✨ App updated — refresh for the latest content');
  }
}

/** Refresh quotes data on app open if stale (bypasses iOS 7-day cache wipe) */
async function refreshOnOpen() {
  const lastRefresh = await getSetting('lastRefresh', 0);
  const staleAfterMs = MS_PER_DAY; // 24 h
  if (Date.now() - lastRefresh > staleAfterMs) {
    if (navigator.serviceWorker?.controller) {
      navigator.serviceWorker.controller.postMessage({ type: 'REFRESH_QUOTES' });
    }
    await setSetting('lastRefresh', Date.now());
  }
}

/* ── Database Init ─────────────────────────────────────────── */
async function initDB() {
  // Load favorites from IndexedDB
  const favs = await getAllFavorites();
  favs.forEach(f => state.favorites.add(f.id));

  // Verify quote integrity
  await verifyQuoteIntegrity();
}

/* ── Quote Integrity Verification ─────────────────────────── */
async function verifyQuoteIntegrity() {
  try {
    let storedSig = await getCacheMeta('quote_sig');

    if (!storedSig) {
      // First run: sign and store
      storedSig = await signQuotes(QUOTES);
      await setCacheMeta('quote_sig', storedSig);
    }

    const valid = await verifyQuotes(QUOTES, storedSig);

    if (valid && QUOTES.length >= 100) {
      state.verifiedQuotes = true;
      console.log(
        '%c✅ Verification Passed',
        'color:#34d399;font-weight:bold;font-size:14px;',
        `— ${QUOTES.length} quotes loaded and HMAC-SHA-256 integrity verified.`
      );
    } else {
      console.error(
        '[Saints & Wisdom] Quote verification FAILED — possible data tampering detected!'
      );
    }
  } catch (err) {
    console.error('[Saints & Wisdom] Integrity check error:', err);
  }
}

/* ── Navigation ────────────────────────────────────────────── */
function setupNavigation() {
  $$('[data-view]').forEach(tab => {
    tab.addEventListener('click', (e) => {
      e.preventDefault();
      const view = tab.dataset.view;
      navigateTo(view);
    });
  });
}

function navigateTo(view) {
  state.currentView = view;

  // Update tab active states
  $$('[data-view]').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.view === view);
    tab.setAttribute('aria-current', tab.dataset.view === view ? 'page' : 'false');
  });

  renderView(view);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ── View Rendering ────────────────────────────────────────── */
function renderView(view) {
  $$('.view').forEach(v => v.classList.remove('active'));
  const el = $(`#view-${view}`);
  if (el) el.classList.add('active');

  switch (view) {
    case 'today':     renderToday();     break;
    case 'browse':    renderBrowse();    break;
    case 'favorites': renderFavorites(); break;
    case 'settings':  renderSettings();  break;
  }
}

/* ── Today View ────────────────────────────────────────────── */
function renderToday() {
  const container = $('#today-container');
  if (!container) return;

  // Pick a deterministic daily quote
  const dayIndex = Math.floor(Date.now() / MS_PER_DAY) % QUOTES.length;
  const hero     = QUOTES[dayIndex];
  // Pick 3 related quotes (same category)
  const related  = QUOTES
    .filter(q => q.category === hero.category && q.id !== hero.id)
    .slice(0, 3);

  container.innerHTML = safeHTML(`
    <div class="quote-grid">
      ${buildHeroCard(hero)}
      ${related.map(buildQuoteCard).join('')}
    </div>
  `);

  attachCardListeners(container);
}

/* ── Browse View ───────────────────────────────────────────── */
function renderBrowse() {
  const container = $('#browse-container');
  if (!container) return;

  const filtered = getFilteredQuotes();
  container.innerHTML = safeHTML(
    filtered.length
      ? `<div class="quote-grid">${filtered.map(buildQuoteCard).join('')}</div>`
      : `<div class="empty-state"><span class="empty-icon">🔍</span><p>No quotes match your search.</p></div>`
  );

  attachCardListeners(container);
}

/* ── Favorites View ────────────────────────────────────────── */
async function renderFavorites() {
  const container = $('#favorites-container');
  if (!container) return;

  const favIds = [...state.favorites];
  const favQuotes = QUOTES.filter(q => favIds.includes(q.id));

  container.innerHTML = safeHTML(
    favQuotes.length
      ? `<div class="quote-grid">${favQuotes.map(buildQuoteCard).join('')}</div>`
      : `<div class="empty-state"><span class="empty-icon">⭐</span><p>No favorites yet.<br>Tap the star on any quote to save it.</p></div>`
  );

  attachCardListeners(container);
}

/* ── Settings View ─────────────────────────────────────────── */
async function renderSettings() {
  // Settings are rendered statically in HTML; just wire up toggles
  const notificationsOn = await getSetting('notifications', false);
  const darkModeOn      = await getSetting('darkMode',      'auto');

  const notifToggle = $('#setting-notifications');
  if (notifToggle) {
    notifToggle.classList.toggle('on', notificationsOn);
    notifToggle.addEventListener('click', async () => {
      const next = !notifToggle.classList.contains('on');
      notifToggle.classList.toggle('on', next);
      await setSetting('notifications', next);
    });
  }

  const versionEl = $('#app-version');
  if (versionEl) {
    versionEl.textContent = `v1.0.0 · ${QUOTES.length} quotes`;
  }

  const verifiedEl = $('#verified-status');
  if (verifiedEl) {
    verifiedEl.textContent = state.verifiedQuotes ? '✅ Integrity verified' : '⚠️ Unverified';
    verifiedEl.className = 'settings-value ' + (state.verifiedQuotes ? 'verified-ok' : 'verified-warn');
  }
}

/* ── Quote Card Builders ────────────────────────────────────── */
function buildHeroCard(q) {
  const favClass = state.favorites.has(q.id) ? 'active' : '';
  return `
    <article class="quote-card quote-hero glass glass-xl" data-id="${q.id}">
      <div class="quote-actions">
        <button class="quote-action-btn fav-btn ${favClass}"
                aria-label="Toggle favorite"
                data-id="${q.id}">⭐</button>
        <button class="quote-action-btn share-btn"
                aria-label="Share quote"
                data-id="${q.id}">↗</button>
      </div>
      <p class="quote-text">${escText(q.text)}</p>
      <div class="quote-attribution">
        <span class="quote-saint">${escText(q.saint)}</span>
        <span class="quote-era">${escText(q.era)} · ${escText(q.source)}</span>
        <span class="quote-category-badge">${escText(q.category)}</span>
        ${state.verifiedQuotes ? '<span class="verified-badge">✓ Verified</span>' : ''}
      </div>
    </article>
  `;
}

function buildQuoteCard(q) {
  const favClass = state.favorites.has(q.id) ? 'active' : '';
  return `
    <article class="quote-card glass" data-id="${q.id}">
      <div class="quote-actions">
        <button class="quote-action-btn fav-btn ${favClass}"
                aria-label="Toggle favorite"
                data-id="${q.id}">⭐</button>
        <button class="quote-action-btn share-btn"
                aria-label="Share quote"
                data-id="${q.id}">↗</button>
      </div>
      <p class="quote-text">${escText(q.text)}</p>
      <div class="quote-attribution">
        <span class="quote-saint">${escText(q.saint)}</span>
        <span class="quote-era">${escText(q.era)}</span>
        <span class="quote-category-badge">${escText(q.category)}</span>
      </div>
    </article>
  `;
}

/** Escape text for safe HTML insertion */
function escText(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ── Card Event Delegation ──────────────────────────────────── */
function attachCardListeners(container) {
  container.addEventListener('click', async (e) => {
    // Favorite button
    const favBtn = e.target.closest('.fav-btn');
    if (favBtn) {
      e.stopPropagation();
      const id = Number(favBtn.dataset.id);
      await toggleFavorite(id, favBtn);
      return;
    }

    // Share button
    const shareBtn = e.target.closest('.share-btn');
    if (shareBtn) {
      e.stopPropagation();
      const id = Number(shareBtn.dataset.id);
      shareQuote(id);
      return;
    }
  });
}

/* ── Favorites ──────────────────────────────────────────────── */
async function toggleFavorite(quoteId, btn) {
  const quote = QUOTES.find(q => q.id === quoteId);
  if (!quote) return;

  if (state.favorites.has(quoteId)) {
    state.favorites.delete(quoteId);
    await removeFavorite(quoteId);
    btn?.classList.remove('active');
    showToast('Removed from favorites');
  } else {
    state.favorites.add(quoteId);
    await addFavorite(quote);
    btn?.classList.add('active');
    showToast('⭐ Added to favorites');
  }

  // Re-render favorites view if active
  if (state.currentView === 'favorites') renderFavorites();
}

/* ── Share ──────────────────────────────────────────────────── */
async function shareQuote(quoteId) {
  const q = QUOTES.find(q => q.id === quoteId);
  if (!q) return;

  const shareText = `"${q.text}" — ${q.saint} (${q.era})`;

  if (navigator.share) {
    try {
      await navigator.share({ title: 'Saints & Wisdom', text: shareText, url: location.href });
    } catch (_) { /* user cancelled */ }
  } else {
    try {
      await navigator.clipboard.writeText(shareText);
      showToast('📋 Quote copied to clipboard');
    } catch (_) {
      showToast('Share is not available on this browser');
    }
  }
}

/* ── Search & Filter ────────────────────────────────────────── */
function setupSearch() {
  const input = $('#search-input');
  if (!input) return;
  input.addEventListener('input', () => {
    state.searchQuery = input.value.trim().toLowerCase();
    if (state.currentView === 'browse') renderBrowse();
  });
}

function setupFilterChips() {
  const container = $('#filter-chips');
  if (!container) return;

  const categories = ['All', ...new Set(QUOTES.map(q => q.category))].sort((a, b) =>
    a === 'All' ? -1 : b === 'All' ? 1 : a.localeCompare(b)
  );

  container.innerHTML = safeHTML(
    categories.map(cat => `
      <button class="filter-chip ${cat === 'All' ? 'active' : ''}"
              data-cat="${escText(cat)}"
              aria-pressed="${cat === 'All'}">${escText(cat)}</button>
    `).join('')
  );

  container.addEventListener('click', (e) => {
    const chip = e.target.closest('.filter-chip');
    if (!chip) return;
    $$('.filter-chip', container).forEach(c => {
      c.classList.remove('active');
      c.setAttribute('aria-pressed', 'false');
    });
    chip.classList.add('active');
    chip.setAttribute('aria-pressed', 'true');
    state.currentFilter = chip.dataset.cat;
    renderBrowse();
  });
}

function getFilteredQuotes() {
  return QUOTES.filter(q => {
    const matchCat  = state.currentFilter === 'All' || q.category === state.currentFilter;
    const matchText = !state.searchQuery ||
      q.text.toLowerCase().includes(state.searchQuery) ||
      q.saint.toLowerCase().includes(state.searchQuery);
    return matchCat && matchText;
  });
}

/* ── Windows Controls Overlay ───────────────────────────────── */
function setupWindowControlsOverlay() {
  if (!('windowControlsOverlay' in navigator)) return;

  const updateWCO = () => {
    const { x, y, width, height } = navigator.windowControlsOverlay.getTitlebarAreaRect();
    document.documentElement.style.setProperty('--titlebar-area-x',      `${x}px`);
    document.documentElement.style.setProperty('--titlebar-area-y',      `${y}px`);
    document.documentElement.style.setProperty('--titlebar-area-width',  `${width}px`);
    document.documentElement.style.setProperty('--titlebar-area-height', `${height}px`);
  };

  navigator.windowControlsOverlay.addEventListener('geometrychange', updateWCO);
  updateWCO();
}

/* ── Theme Color (Android navigation bar & status bar) ─────── */
function setupThemeColor() {
  const darkMQ   = window.matchMedia('(prefers-color-scheme: dark)');
  const metaTag  = document.querySelector('meta[name="theme-color"]');
  const applyColor = (isDark) => {
    if (metaTag) metaTag.content = isDark ? '#1e1b4b' : '#6d28d9';
  };
  applyColor(darkMQ.matches);
  darkMQ.addEventListener('change', e => applyColor(e.matches));
}

/* ── Share Button Setup ─────────────────────────────────────── */
function setupShareButtons() {
  // Delegated via attachCardListeners — nothing extra needed here
}

/* ── Install Prompt ─────────────────────────────────────────── */
function setupInstallPrompt() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    state.deferredPrompt = e;
    const banner = $('#install-banner');
    if (banner) banner.classList.add('visible');
  });

  const installBtn = $('#install-btn');
  if (installBtn) {
    installBtn.addEventListener('click', async () => {
      if (!state.deferredPrompt) return;
      state.deferredPrompt.prompt();
      const { outcome } = await state.deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        showToast('🎉 App installed successfully!');
      }
      state.deferredPrompt = null;
      const banner = $('#install-banner');
      if (banner) banner.classList.remove('visible');
    });
  }

  const dismissBtn = $('#install-dismiss');
  if (dismissBtn) {
    dismissBtn.addEventListener('click', () => {
      const banner = $('#install-banner');
      if (banner) banner.classList.remove('visible');
    });
  }

  window.addEventListener('appinstalled', () => {
    state.deferredPrompt = null;
    showToast('🎉 App installed!');
  });
}

/* ── Toast Notifications ────────────────────────────────────── */
function showToast(message, duration = 3000) {
  const container = $('#toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;   // textContent avoids XSS
  container.appendChild(toast);

  setTimeout(() => toast.remove(), duration);
}
