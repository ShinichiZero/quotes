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
const TAB_VIEWS = ['today', 'browse', 'favorites', 'settings'];

function getLocalDayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function dayDiff(previousDay, currentDay) {
  const previous = new Date(`${previousDay}T00:00:00`);
  const current  = new Date(`${currentDay}T00:00:00`);
  return Math.round((current - previous) / MS_PER_DAY);
}

function hashString(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) - hash) + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function getDailyQuoteIndex(dayKey = getLocalDayKey()) {
  if (!QUOTES.length) return 0;
  return hashString(dayKey) % QUOTES.length;
}

function getCurrentLocale() {
  return translations[state.language] ? state.language : 'en';
}

function getDisplayQuoteText(quote) {
  return (getCurrentLocale() === 'it' && quote.textIt) ? quote.textIt : quote.text;
}

function isTypingTarget(el) {
  return !!el && (
    el.tagName === 'INPUT' ||
    el.tagName === 'TEXTAREA' ||
    el.isContentEditable
  );
}

function applyAccessibilityPreferences() {
  document.documentElement.setAttribute('data-text-size', state.textSize);
  document.body.classList.toggle('readability-mode', state.readability);
}

/* ── State ─────────────────────────────────────────────────── */
const state = {
  currentView:    'today',
  currentFilter:  'All',
  searchQuery:    '',
  favorites:      new Set(),
  deferredPrompt: null,
  verifiedQuotes: false,
  language:       'en',
  manualQuoteId:  null,
  streak:         0,
  lastVisitDay:   '',
  textSize:       'comfortable',
  readability:    false,
};

/* ── Bootstrap ─────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', async () => {
  try {
    await Promise.allSettled([
      registerServiceWorker(),
      initDB()
    ]);
  } catch(e) {
    console.warn("Init partially failed, continuing:", e);
  }
  setupInstallPrompt();

  setupNavigation();
  setupSearch();
  setupFilterChips();
  setupWindowControlsOverlay();
  setupThemeColor();
  setupKeyboardShortcuts();
  applyAccessibilityPreferences();
  setupShareButtons();
  refreshOnOpen();

  renderView('today');
});

/* ── Service Worker ────────────────────────────────────────── */
async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const swURL = safeScriptURL(new URL('../sw.js', import.meta.url).href);
    const swScope = new URL('../', import.meta.url).pathname;
    const reg = await navigator.serviceWorker.register(swURL, { scope: swScope });

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

  // Load language preference
  state.language = await getSetting('language', 'en');
  state.textSize = await getSetting('textSize', 'comfortable');
  state.readability = await getSetting('readability', false);
  state.streak = await getSetting('dailyStreak', 0);
  state.lastVisitDay = await getSetting('lastVisitDay', '');

  await ensureDailyStreak();

  // Verify quote integrity
  await verifyQuoteIntegrity();
}

async function ensureDailyStreak() {
  const today = getLocalDayKey();
  if (state.lastVisitDay === today) {
    if (!state.streak) state.streak = 1;
    return;
  }

  if (!state.lastVisitDay) {
    state.streak = 1;
  } else {
    const delta = dayDiff(state.lastVisitDay, today);
    state.streak = delta === 1 ? (state.streak + 1) : 1;
  }

  state.lastVisitDay = today;
  await Promise.all([
    setSetting('dailyStreak', state.streak),
    setSetting('lastVisitDay', state.lastVisitDay),
  ]);
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

/* ── UI Translations ───────────────────────────────────────── */
const translations = {
  en: {
    today: "Today's Quote",
    navToday: 'Today',
    browse: "Browse Quotes",
    navBrowse: 'Browse',
    favorites: "Favorites",
    navFavorites: 'Saved',
    settings: "Settings",
    navSettings: 'Settings',
    search: "Search saints, quotes…",
    searchLbl: "Search quotes",
    installBtn: "Install",
    installTxt: "Install <strong>Saints &amp; Wisdom</strong> for an offline experience!",
    emptyFav: "No favorites yet.<br>Tap the star on any quote to save it.",
    emptySearch: "No quotes match your search.",
    noRelated: 'No related quotes available for this category yet.',
    newInspiration: 'Another Inspiration',
    streakLabel: '🔥 {count}-day reflection streak',
    appLabel: 'App',
    languageLabel: 'Language',
    dailyNotifLabel: 'Daily Notifications',
    textSizeLabel: 'Reading Size',
    readabilityLabel: 'High Readability Mode',
    compact: 'Compact',
    comfortable: 'Comfortable',
    large: 'Large',
    addedFavorite: '⭐ Added to favorites',
    removedFavorite: 'Removed from favorites',
    quoteShareCopied: '📋 Quote copied to clipboard',
    quoteShareUnavailable: 'Share is not available on this browser',
    integrityVerified: '✅ Integrity verified',
    integrityWarning: '⚠️ Unverified',
  },
  it: {
    today: "Frase del Giorno",
    navToday: 'Oggi',
    browse: "Esplora",
    navBrowse: 'Esplora',
    favorites: "Preferiti",
    navFavorites: 'Salvati',
    settings: "Impostazioni",
    navSettings: 'Impost.',
    search: "Cerca santi, frasi…",
    searchLbl: "Cerca frasi",
    installBtn: "Installa",
    installTxt: "Installa <strong>Saints &amp; Wisdom</strong> per usarlo offline!",
    emptyFav: "Nessun preferito.<br>Tocca la stella su una frase per salvarla.",
    emptySearch: "Nessuna frase corrisponde alla ricerca.",
    noRelated: 'Nessuna frase correlata disponibile per questa categoria.',
    newInspiration: 'Nuova Ispirazione',
    streakLabel: '🔥 Serie di riflessione: {count} giorni',
    appLabel: 'App',
    languageLabel: 'Lingua',
    dailyNotifLabel: 'Notifiche Giornaliere',
    textSizeLabel: 'Dimensione Lettura',
    readabilityLabel: 'Modalita Alta Leggibilita',
    compact: 'Compatta',
    comfortable: 'Confortevole',
    large: 'Grande',
    addedFavorite: '⭐ Aggiunto ai preferiti',
    removedFavorite: 'Rimosso dai preferiti',
    quoteShareCopied: '📋 Frase copiata negli appunti',
    quoteShareUnavailable: 'Condivisione non disponibile in questo browser',
    integrityVerified: '✅ Integrita verificata',
    integrityWarning: '⚠️ Non verificato',
  }
};

function updateUITexts() {
  const t = translations[getCurrentLocale()];
  const $ = (s) => document.querySelector(s);
  
  if ($('#today-heading')) $('#today-heading').innerHTML = `<span aria-hidden="true">☀️</span> ${t.today}`;
  if ($('#browse-heading')) $('#browse-heading').innerHTML = `<span aria-hidden="true">📖</span> ${t.browse}`;
  if ($('#favorites-heading')) $('#favorites-heading').innerHTML = `<span aria-hidden="true">⭐</span> ${t.favorites}`;
  if ($('#settings-heading')) $('#settings-heading').innerHTML = `<span aria-hidden="true">⚙️</span> ${t.settings}`;
  if ($('#search-input')) {
    $('#search-input').placeholder = t.search;
    const label = document.querySelector('label[for="search-input"]');
    if (label) label.textContent = t.searchLbl;
  }
  
  if ($('#install-txt')) $('#install-txt').innerHTML = t.installTxt;
  if ($('#install-btn')) $('#install-btn').textContent = t.installBtn;

  if ($('#label-app-settings')) $('#label-app-settings').textContent = t.appLabel;
  if ($('#label-language')) $('#label-language').textContent = t.languageLabel;
  if ($('#label-daily-notif')) $('#label-daily-notif').textContent = t.dailyNotifLabel;
  if ($('#label-text-size')) $('#label-text-size').textContent = t.textSizeLabel;
  if ($('#label-readability')) $('#label-readability').textContent = t.readabilityLabel;

  const textSizeSelect = $('#setting-text-size');
  if (textSizeSelect?.options?.length >= 3) {
    textSizeSelect.options[0].textContent = t.compact;
    textSizeSelect.options[1].textContent = t.comfortable;
    textSizeSelect.options[2].textContent = t.large;
  }
  
  // Also update bottom nav
  const navItems = document.querySelectorAll('.nav-label');
  if (navItems.length >= 4) {
    navItems[0].textContent = t.navToday;
    navItems[1].textContent = t.navBrowse;
    navItems[2].textContent = t.navFavorites;
    navItems[3].textContent = t.navSettings;
  }
}

/* ── View Rendering ────────────────────────────────────────── */
function renderView(view) {
  $$('.view').forEach(v => v.classList.remove('active'));
  const el = $(`#view-${view}`);
  if (el) el.classList.add('active');

  updateUITexts();

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

  const t = translations[getCurrentLocale()];

  // Pick a deterministic daily quote
  const dayIndex = state.manualQuoteId
    ? QUOTES.findIndex(q => q.id === state.manualQuoteId)
    : getDailyQuoteIndex();
  const hero = QUOTES[dayIndex >= 0 ? dayIndex : 0];

  if (!hero) {
    container.innerHTML = safeHTML('<p class="empty-state">No quotes available.</p>');
    return;
  }

  // Pick 3 related quotes (same category)
  const related  = QUOTES
    .filter(q => q.category === hero.category && q.id !== hero.id)
    .slice(0, 3);

  const streakLabel = t.streakLabel.replace('{count}', String(state.streak));

  container.innerHTML = safeHTML(`
    <div class="today-toolbar glass glass-sm">
      <button class="btn-secondary" id="today-reroll-btn" type="button">${escText(t.newInspiration)}</button>
      <p class="today-streak">${escText(streakLabel)}</p>
    </div>
    <div class="quote-grid">
      ${buildHeroCard(hero)}
      ${related.length
        ? related.map(buildQuoteCard).join('')
        : `<p class="related-empty">${escText(t.noRelated)}</p>`}
    </div>
  `);

  const rerollBtn = $('#today-reroll-btn', container);
  if (rerollBtn) {
    rerollBtn.addEventListener('click', () => {
      const candidates = QUOTES.filter(q => q.id !== hero.id);
      const next = candidates[Math.floor(Math.random() * candidates.length)] ?? hero;
      state.manualQuoteId = next.id;
      renderToday();
    });
  }

  attachCardListeners(container);
}

/* ── Browse View ───────────────────────────────────────────── */
function renderBrowse() {
  const container = $('#browse-container');
  if (!container) return;
  const t = translations[getCurrentLocale()];

  const filtered = getFilteredQuotes();
  container.innerHTML = safeHTML(
    filtered.length
      ? `<div class="quote-grid">${filtered.map(buildQuoteCard).join('')}</div>`
      : `<div class="empty-state"><span class="empty-icon">🔍</span><p>${t.emptySearch}</p></div>`
  );

  attachCardListeners(container);
}

/* ── Favorites View ────────────────────────────────────────── */
async function renderFavorites() {
  const container = $('#favorites-container');
  if (!container) return;
  const t = translations[getCurrentLocale()];

  const favIds = [...state.favorites];
  const favQuotes = QUOTES.filter(q => favIds.includes(q.id));

  container.innerHTML = safeHTML(
    favQuotes.length
      ? `<div class="quote-grid">${favQuotes.map(buildQuoteCard).join('')}</div>`
      : `<div class="empty-state"><span class="empty-icon">⭐</span><p>${t.emptyFav}</p></div>`
  );

  attachCardListeners(container);
}

/* ── Settings View ─────────────────────────────────────────── */
async function renderSettings() {
  const t = translations[getCurrentLocale()];

  // Settings are rendered statically in HTML; just wire up toggles
  const notificationsOn = await getSetting('notifications', false);
  const language        = getCurrentLocale();

  const langSelect = $('#setting-language');
  if (langSelect) {
    langSelect.value = language;
    if (!langSelect.dataset.bound) {
      langSelect.dataset.bound = '1';
      langSelect.addEventListener('change', async (e) => {
        state.language = e.target.value;
        await setSetting('language', state.language);

        // Re-render UI to update text immediately
        setupFilterChips();
        renderView(state.currentView);
      });
    }
  }

  const textSizeSelect = $('#setting-text-size');
  if (textSizeSelect) {
    textSizeSelect.value = state.textSize;
    if (!textSizeSelect.dataset.bound) {
      textSizeSelect.dataset.bound = '1';
      textSizeSelect.addEventListener('change', async (e) => {
        state.textSize = e.target.value;
        await setSetting('textSize', state.textSize);
        applyAccessibilityPreferences();
      });
    }
  }

  const notifToggle = $('#setting-notifications');
  if (notifToggle) {
    notifToggle.classList.toggle('on', notificationsOn);
    notifToggle.setAttribute('aria-checked', String(notificationsOn));
    if (!notifToggle.dataset.bound) {
      notifToggle.dataset.bound = '1';
      notifToggle.addEventListener('click', async () => {
        const next = !notifToggle.classList.contains('on');
        notifToggle.classList.toggle('on', next);
        notifToggle.setAttribute('aria-checked', String(next));
        await setSetting('notifications', next);
      });
      notifToggle.addEventListener('keydown', async (e) => {
        if (e.key !== ' ' && e.key !== 'Enter') return;
        e.preventDefault();
        const next = !notifToggle.classList.contains('on');
        notifToggle.classList.toggle('on', next);
        notifToggle.setAttribute('aria-checked', String(next));
        await setSetting('notifications', next);
      });
    }
  }

  const readabilityToggle = $('#setting-readability');
  if (readabilityToggle) {
    readabilityToggle.classList.toggle('on', state.readability);
    readabilityToggle.setAttribute('aria-checked', String(state.readability));
    if (!readabilityToggle.dataset.bound) {
      readabilityToggle.dataset.bound = '1';
      readabilityToggle.addEventListener('click', async () => {
        state.readability = !state.readability;
        readabilityToggle.classList.toggle('on', state.readability);
        readabilityToggle.setAttribute('aria-checked', String(state.readability));
        await setSetting('readability', state.readability);
        applyAccessibilityPreferences();
      });
      readabilityToggle.addEventListener('keydown', async (e) => {
        if (e.key !== ' ' && e.key !== 'Enter') return;
        e.preventDefault();
        state.readability = !state.readability;
        readabilityToggle.classList.toggle('on', state.readability);
        readabilityToggle.setAttribute('aria-checked', String(state.readability));
        await setSetting('readability', state.readability);
        applyAccessibilityPreferences();
      });
    }
  }

  const versionEl = $('#app-version');
  if (versionEl) {
    versionEl.textContent = `v1.0.0 · ${QUOTES.length} quotes`;
  }

  const verifiedEl = $('#verified-status');
  if (verifiedEl) {
    verifiedEl.textContent = state.verifiedQuotes ? t.integrityVerified : t.integrityWarning;
    verifiedEl.className = 'settings-value ' + (state.verifiedQuotes ? 'verified-ok' : 'verified-warn');
  }
}

/* ── Quote Card Builders ────────────────────────────────────── */
function buildHeroCard(q) {
  const favClass = state.favorites.has(q.id) ? 'active' : '';
  const textToShow = getDisplayQuoteText(q);
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
      <p class="quote-text">${escText(textToShow)}</p>
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
  const textToShow = getDisplayQuoteText(q);
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
      <p class="quote-text">${escText(textToShow)}</p>
      <div class="quote-attribution">
        <span class="quote-saint">${escText(q.saint)}</span>
        <span class="quote-era">${escText(q.era)} · ${escText(q.source)}</span>
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
  if (container.dataset.listenersBound === '1') return;
  container.dataset.listenersBound = '1';

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
  const t = translations[getCurrentLocale()];
  const quote = QUOTES.find(q => q.id === quoteId);
  if (!quote) return;

  if (state.favorites.has(quoteId)) {
    state.favorites.delete(quoteId);
    await removeFavorite(quoteId);
    btn?.classList.remove('active');
    showToast(t.removedFavorite);
  } else {
    state.favorites.add(quoteId);
    await addFavorite(quote);
    btn?.classList.add('active');
    showToast(t.addedFavorite);
  }

  // Re-render favorites view if active
  if (state.currentView === 'favorites') renderFavorites();
}

/* ── Share ──────────────────────────────────────────────────── */
async function shareQuote(quoteId) {
  const t = translations[getCurrentLocale()];
  const q = QUOTES.find(q => q.id === quoteId);
  if (!q) return;

  const shareText = `"${getDisplayQuoteText(q)}" — ${q.saint} (${q.era})`;

  if (navigator.share) {
    try {
      await navigator.share({ title: 'Saints & Wisdom', text: shareText, url: location.href });
    } catch (_) { /* user cancelled */ }
  } else {
    try {
      await navigator.clipboard.writeText(shareText);
      showToast(t.quoteShareCopied);
    } catch (_) {
      showToast(t.quoteShareUnavailable);
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
  const locale = getCurrentLocale();

  const categories = ['All', ...new Set(QUOTES.map(q => q.category))].sort((a, b) =>
    a === 'All' ? -1 : b === 'All' ? 1 : a.localeCompare(b)
  );

  const getCatLabel = (cat) => {
    if (cat === 'All') return locale === 'it' ? 'Tutti' : 'All';
    return cat;
  };

  container.innerHTML = safeHTML(
    categories.map(cat => `
      <button class="filter-chip ${cat === state.currentFilter || (cat === 'All' && state.currentFilter === 'All') ? 'active' : ''}"
              data-cat="${escText(cat)}"
              aria-pressed="${cat === state.currentFilter}">${escText(getCatLabel(cat))}</button>
    `).join('')
  );

  // Clear previous listeners to avoid duplicates if re-rendered
  const newContainer = container.cloneNode(true);
  container.parentNode.replaceChild(newContainer, container);
  
  newContainer.addEventListener('click', (e) => {
    const chip = e.target.closest('.filter-chip');
    if (!chip) return;
    $$('.filter-chip', newContainer).forEach(c => {
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
    const haystack = `${q.text} ${q.textIt ?? ''} ${q.saint} ${q.source} ${q.category}`.toLowerCase();
    const matchText = !state.searchQuery || haystack.includes(state.searchQuery);
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
    if (metaTag) metaTag.content = isDark ? '#2e1010' : '#991b1b';
  };
  applyColor(darkMQ.matches);
  darkMQ.addEventListener('change', e => applyColor(e.matches));
}

/* ── Keyboard Shortcuts ────────────────────────────────────── */
function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    if (e.defaultPrevented) return;

    if (e.key === '/' && !isTypingTarget(e.target)) {
      e.preventDefault();
      navigateTo('browse');
      const searchInput = $('#search-input');
      searchInput?.focus();
      return;
    }

    if (e.altKey && TAB_VIEWS[Number(e.key) - 1]) {
      e.preventDefault();
      navigateTo(TAB_VIEWS[Number(e.key) - 1]);
      return;
    }

    if ((e.key === 'r' || e.key === 'R') && state.currentView === 'today' && !isTypingTarget(e.target)) {
      e.preventDefault();
      $('#today-reroll-btn')?.click();
    }
  });
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

