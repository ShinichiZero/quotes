# Security Policy — Saints & Wisdom PWA

## Threat Model

### Assets Under Protection
| Asset | Sensitivity | Rationale |
|---|---|---|
| Quote data (quotes.js) | Medium | Tampering would surface false or offensive "saint quotes" to users |
| User favorites (IndexedDB) | Low | Personal preference data, no PII |
| Service Worker (sw.js) | High | Hijacking would allow persistent MITM for all app requests |
| Web App Manifest | Medium | Tampering could redirect installs to a malicious origin |

### Threat Actors
| Threat | Likelihood | Impact |
|---|---|---|
| Storage Injection (XSS writes tampered data to IndexedDB) | Medium | High |
| Service Worker Hijacking (malicious SW registered at `/`) | Low | Critical |
| Content Spoofing (modified quotes in cache or IDB) | Medium | High |
| Clickjacking | Low | Medium |
| Cross-Site Scripting (XSS) | Low | High |
| Supply-Chain Attack (CDN script injection) | Low-Medium | Critical |

---

## Security Features Implemented

### 1. Content Security Policy (CSP)

Set via `<meta http-equiv="Content-Security-Policy">` in `index.html`:

```
default-src 'self';
script-src 'self';
style-src 'self';
img-src 'self' data:;
connect-src 'self';
worker-src 'self';
manifest-src 'self';
object-src 'none';
base-uri 'self';
frame-ancestors 'none';
upgrade-insecure-requests;
require-trusted-types-for 'script';
trusted-types saints-wisdom-default;
```

**Key decisions:**
- No `'unsafe-inline'` or `'unsafe-eval'` — prevents inline script injection.
- `object-src 'none'` — blocks Flash and other plugins.
- `base-uri 'self'` — prevents `<base>` tag injection that could redirect relative URLs to an attacker-controlled origin.
- `frame-ancestors 'none'` — prevents clickjacking via `<iframe>`.
- `upgrade-insecure-requests` — upgrades all HTTP sub-resource loads to HTTPS.

**Deploying with HTTP headers** (recommended for production, stronger than meta tag):
```
Content-Security-Policy: default-src 'self'; script-src 'self'; ...
```
The meta-tag approach is used here for static hosting compatibility but **HTTP response headers are preferred** since they cannot be stripped by a compromised document.

### 2. Trusted Types API

The application creates a single Trusted Types policy named `saints-wisdom-default`:

```js
window.trustedTypes.createPolicy('saints-wisdom-default', {
  createHTML: (s) => s,  // accepts only internally generated HTML
});
```

All `innerHTML` assignments in `app.js` pass through `safeHTML()` which wraps content with the Trusted Types policy. User-provided text (search query, quote content) is always HTML-escaped via `escText()` before injection:

```js
function escText(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
```

Dynamic text that originates from user input (e.g., the search bar) is **never** placed into `innerHTML` — it is always set via `textContent`.

### 3. Subresource Integrity (SRI)

**Current state:** The app uses no external CDN resources. All CSS and JS are served from the same origin, so SRI hashes are not required.

**If a CDN dependency is added** (e.g., Tailwind CSS from a CDN), compute and include the SRI hash:

```html
<link rel="stylesheet"
      href="https://cdn.example.com/tailwind.css"
      integrity="sha384-<base64-hash>"
      crossorigin="anonymous" />
```

To compute an SRI hash:
```bash
openssl dgst -sha384 -binary tailwind.css | openssl base64 -A
# then prefix with: sha384-
```

### 4. Quote Integrity — HMAC-SHA-256 Signing

Located in `js/crypto.js`.

**Purpose:** Detect tampering with the quote data stored in the browser cache or IndexedDB (Storage Injection attack).

**Mechanism:**
1. On first load, `signQuotes(QUOTES)` computes an HMAC-SHA-256 over the canonical JSON representation of all 110 quotes.
2. The signature is stored in IndexedDB (`cache_meta` store, key `quote_sig`).
3. On every subsequent load, `verifyQuotes(QUOTES, storedSig)` re-computes the HMAC and compares it to the stored signature using the Web Crypto API's constant-time `verify` function.
4. If verification **fails**, a console error is emitted and the verified badge is hidden from the UI.

**Key:**
```
saints-wisdom-integrity-v1
```
The key is deterministic and publicly known. Its purpose is **data integrity detection** (tamper-evident logging), not secret-key security. An attacker with physical device access could re-compute the HMAC. For stronger guarantees, serve the signing key from a server-side endpoint protected by authentication.

**Canonical form:**
```js
quotes.sort((a, b) => a.id - b.id).map(({ id, saint, era, text, category, source }) => ...)
```
Only stable, non-volatile fields are included. The canonical form is deterministic across sessions.

---

## Identified Risks & Patches

### Risk 1: Storage Injection

**Attack vector:** An XSS payload writes arbitrary data to IndexedDB (e.g., replaces quotes with offensive content).

**Mitigations applied:**
- Strict CSP (`script-src 'self'`) makes XSS extremely difficult.
- Trusted Types prevents DOM XSS even if a script finds a way to run.
- HMAC-SHA-256 quote verification detects corrupted data on next load.
- `escText()` escapes all user-controlled strings before HTML insertion.

**Residual risk:** If the device is physically compromised, an attacker could reset the IndexedDB signature alongside the data. Mitigate with a server-signed JWT containing the quote hash.

### Risk 2: Service Worker Hijacking

**Attack vector:** A malicious script registers a Service Worker at `/` that intercepts all network requests and serves poisoned responses.

**Mitigations applied:**
- `worker-src 'self'` in CSP prevents registration of any SW not hosted on the same origin.
- The SW is served with `Content-Type: application/javascript` and same-origin restriction.
- The SW only caches `isCacheable()` responses: same-origin, status 200, non-opaque.
- Opaque cross-origin responses are explicitly rejected:
  ```js
  response.type !== 'opaque'
  ```
- `clients.claim()` on activate ensures new SW takes control immediately.
- SW version string (`CACHE_VERSION`) must be bumped to invalidate old caches.

**Residual risk:** If the hosting origin itself is compromised, there is no browser-level defense against a malicious SW. Use HTTPS with HSTS preloading and keep dependencies up to date.

### Risk 3: Man-in-the-Middle (MITM)

**Mitigations:**
- `upgrade-insecure-requests` in CSP.
- Deploy with HTTPS and HSTS header:
  ```
  Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
  ```

### Risk 4: Clickjacking

**Mitigation:** `frame-ancestors 'none'` in CSP (and optionally `X-Frame-Options: DENY` header for older browsers).

---

## Reporting a Vulnerability

Please report security vulnerabilities privately via GitHub's **Security Advisories** feature (Settings → Security → Report a vulnerability).

Do **not** open a public issue for security reports.

We aim to respond within 72 hours and resolve critical issues within 14 days.

---

## Recommended Production Hardening

1. Serve CSP as an **HTTP response header** (stronger than meta tag).
2. Add `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`.
3. Add `X-Content-Type-Options: nosniff`.
4. Add `Referrer-Policy: strict-origin-when-cross-origin`.
5. Add `Permissions-Policy: geolocation=(), camera=(), microphone=()`.
6. Rotate the HMAC signing key server-side and deliver it via a signed cookie or authenticated API endpoint.
7. Consider a server-side quote signature endpoint for stronger tamper detection.
8. Enable [Certificate Transparency](https://certificate.transparency.dev/) monitoring.
