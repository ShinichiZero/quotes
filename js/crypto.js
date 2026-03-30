/**
 * crypto.js — Quote integrity signing & verification
 *
 * Uses the Web Crypto API (HMAC-SHA-256) to sign and verify
 * the quotes JSON payload, preventing storage-injection attacks.
 *
 * NOTE: The key is deterministic and publicly known.
 * The purpose is DATA INTEGRITY (tamper detection), NOT
 * confidentiality.  An attacker who modifies quotes in IndexedDB
 * or the cache will be detected on the next verification pass.
 *
 * For true secret-key protection, rotate the key server-side and
 * distribute via a signed Service-Worker response.
 */

const KEY_MATERIAL = 'saints-wisdom-integrity-v1';
const ALGORITHM    = { name: 'HMAC', hash: 'SHA-256' };

/** Import a deterministic HMAC key from the well-known key material */
async function getKey() {
  const enc = new TextEncoder();
  const raw = enc.encode(KEY_MATERIAL);
  const baseKey = await crypto.subtle.importKey(
    'raw', raw, ALGORITHM, false, ['sign', 'verify']
  );
  return baseKey;
}

/**
 * Sign a canonical JSON string of the quotes array.
 * @param {object[]} quotes
 * @returns {Promise<string>} hex-encoded HMAC-SHA-256 signature
 */
export async function signQuotes(quotes) {
  const key = await getKey();
  const enc = new TextEncoder();
  const canonical = canonicalize(quotes);
  const data = enc.encode(canonical);
  const sigBuf = await crypto.subtle.sign(ALGORITHM, key, data);
  return bufToHex(sigBuf);
}

/**
 * Verify the signature over the quotes array.
 * @param {object[]} quotes
 * @param {string}   hexSig  — previously stored hex signature
 * @returns {Promise<boolean>}
 */
export async function verifyQuotes(quotes, hexSig) {
  const key = await getKey();
  const enc = new TextEncoder();
  const canonical = canonicalize(quotes);
  const data = enc.encode(canonical);
  const sigBuf = hexToBuf(hexSig);
  return crypto.subtle.verify(ALGORITHM, key, sigBuf, data);
}

/**
 * Produce a deterministic JSON string for an array of quote objects
 * (sorted by id, with only the content fields included).
 *
 * born/died are intentionally excluded — they are metadata helpers
 * and not part of the quote's verifiable content payload. Only
 * fields that would meaningfully change the displayed quote are
 * canonicalised: id, saint, era, text, category, source.
 */
function canonicalize(quotes) {
  const stable = quotes
    .slice()
    .sort((a, b) => a.id - b.id)
    .map(({ id, saint, era, text, category, source }) => ({
      id, saint, era, text, category, source
    }));
  return JSON.stringify(stable);
}

/** ArrayBuffer → lowercase hex string */
function bufToHex(buf) {
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Lowercase hex string → ArrayBuffer */
function hexToBuf(hex) {
  if (typeof hex !== 'string' || hex.length % 2 !== 0) {
    throw new TypeError('Invalid hex string');
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes.buffer;
}
