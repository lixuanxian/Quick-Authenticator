// ── Web Backend (Browser / PWA) ──────────────────────────────────────────────
// Pure JS implementation of TOTP + storage + clipboard, no Tauri dependency.

const STORAGE_KEY = 'totp_authenticator_accounts';
const B32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

// ── Base32 ───────────────────────────────────────────────────────────────────

function base32Decode(encoded) {
  encoded = encoded.replace(/[\s=]/g, '').toUpperCase();
  let bits = '';
  for (const c of encoded) {
    const val = B32_ALPHABET.indexOf(c);
    if (val === -1) throw new Error('Invalid Base32 character: ' + c);
    bits += val.toString(2).padStart(5, '0');
  }
  const bytes = new Uint8Array(Math.floor(bits.length / 8));
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2);
  }
  return bytes;
}

function base32Encode(bytes) {
  let bits = '';
  for (const b of bytes) bits += b.toString(2).padStart(8, '0');
  let result = '';
  for (let i = 0; i < bits.length; i += 5) {
    const chunk = bits.slice(i, i + 5).padEnd(5, '0');
    result += B32_ALPHABET[parseInt(chunk, 2)];
  }
  return result;
}

// ── HMAC via Web Crypto ──────────────────────────────────────────────────────

const ALGO_MAP = { SHA1: 'SHA-1', SHA256: 'SHA-256', SHA512: 'SHA-512' };

async function hmac(algorithm, key, message) {
  const cryptoKey = await crypto.subtle.importKey(
    'raw', key, { name: 'HMAC', hash: algorithm }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, message);
  return new Uint8Array(sig);
}

// ── HOTP (RFC 4226) ─────────────────────────────────────────────────────────

async function hotp(secret, counter, digits, algorithm) {
  const buf = new ArrayBuffer(8);
  new DataView(buf).setBigUint64(0, BigInt(counter));

  const hash = await hmac(ALGO_MAP[algorithm] || 'SHA-1', secret, new Uint8Array(buf));
  const offset = hash[hash.length - 1] & 0x0f;
  const code = (
    ((hash[offset] & 0x7f) << 24) |
    ((hash[offset + 1] & 0xff) << 16) |
    ((hash[offset + 2] & 0xff) << 8) |
    (hash[offset + 3] & 0xff)
  ) % (10 ** digits);

  return code.toString().padStart(digits, '0');
}

// ── TOTP (RFC 6238) ─────────────────────────────────────────────────────────

async function generateTotpCode(secretB32, period, digits, algorithm) {
  const secret = base32Decode(secretB32);
  const now = Math.floor(Date.now() / 1000);
  const counter = Math.floor(now / period);
  const code = await hotp(secret, counter, digits, algorithm);
  const remaining = period - (now % period);
  const progress = remaining / period;
  return { code, remaining, progress };
}

// ── Storage (localStorage) ──────────────────────────────────────────────────

export async function initStore() {
  // no-op for localStorage
}

export async function getAccounts() {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? JSON.parse(raw) : [];
}

export async function saveAccounts(accounts) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts));
}

// ── TOTP API ────────────────────────────────────────────────────────────────

export async function generateTotp(account) {
  return generateTotpCode(account.secret, account.period, account.digits, account.algorithm);
}

export async function generateHotp(account) {
  const secret = base32Decode(account.secret);
  const code = await hotp(secret, account.counter || 0, account.digits || 6, account.algorithm || 'SHA1');
  return { code, counter: account.counter || 0 };
}

export async function generateAllTotp(accounts) {
  const results = [];
  for (const acc of accounts) {
    if (acc.account_type === 'hotp') continue;
    try {
      const result = await generateTotpCode(acc.secret, acc.period, acc.digits, acc.algorithm);
      results.push({ id: acc.id, ...result });
    } catch (e) {
      // skip failed entries
    }
  }
  return results;
}

export async function parseOtpauthUri(uri) {
  let accountType = 'totp';
  let withoutScheme;
  if (uri.startsWith('otpauth://totp/')) {
    withoutScheme = uri.slice('otpauth://totp/'.length);
  } else if (uri.startsWith('otpauth://hotp/')) {
    accountType = 'hotp';
    withoutScheme = uri.slice('otpauth://hotp/'.length);
  } else {
    throw new Error('Only TOTP and HOTP URIs are supported');
  }
  const qIdx = withoutScheme.indexOf('?');
  if (qIdx === -1) throw new Error('Missing query parameters');

  const label = decodeURIComponent(withoutScheme.slice(0, qIdx));
  const query = withoutScheme.slice(qIdx + 1);

  let issuer = '', name = label;
  if (label.includes(':')) {
    const parts = label.split(':');
    issuer = parts[0].trim();
    name = parts.slice(1).join(':').trim();
  }

  const params = new URLSearchParams(query);
  const secret = (params.get('secret') || '').toUpperCase();
  if (!secret) throw new Error('Secret is required');
  if (params.has('issuer')) issuer = params.get('issuer');

  return {
    id: crypto.randomUUID(),
    name,
    issuer,
    secret,
    algorithm: (params.get('algorithm') || 'SHA1').toUpperCase(),
    digits: parseInt(params.get('digits') || '6'),
    period: parseInt(params.get('period') || '30'),
    account_type: accountType,
    counter: parseInt(params.get('counter') || '0'),
    icon: null,
  };
}

export async function validateSecret(secret) {
  try {
    base32Decode(secret.toUpperCase());
    return true;
  } catch {
    return false;
  }
}

export async function generateNewSecret() {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  return base32Encode(bytes);
}

// ── Clipboard ───────────────────────────────────────────────────────────────

export async function copyText(text) {
  await navigator.clipboard.writeText(text);
}

// ── Window controls (no-op on web) ──────────────────────────────────────────

export function startDragging() {}
export function closeWindow() {}
export function minimizeWindow() {}
export function toggleMaximize() {}
