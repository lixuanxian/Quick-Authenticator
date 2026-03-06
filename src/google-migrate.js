// ── Google Authenticator Migration Import ────────────────────────────────────
// Parses otpauth-migration://offline?data=... QR codes exported by
// Google Authenticator. The data is a base64-encoded protobuf (MigrationPayload).

import { t } from "./i18n.js";

const ALGO_MAP = { 0: "SHA1", 1: "SHA1", 2: "SHA256", 3: "SHA512" };
const ALGO_REVERSE = { "SHA1": 1, "SHA256": 2, "SHA512": 3 };
const DIGITS_MAP = { 0: 6, 1: 6, 2: 8 };
const DIGITS_REVERSE = { 6: 1, 8: 2 };
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function bytesToBase32(bytes) {
  let bits = "";
  for (const b of bytes) bits += b.toString(2).padStart(8, "0");
  let result = "";
  for (let i = 0; i < bits.length; i += 5) {
    result += B32[parseInt(bits.slice(i, i + 5).padEnd(5, "0"), 2)];
  }
  return result;
}

// ── Minimal protobuf decoder for MigrationPayload ────────────────────────────

function readVarint(buf, offset) {
  let result = 0, shift = 0;
  while (offset < buf.length) {
    const b = buf[offset++];
    result |= (b & 0x7f) << shift;
    if ((b & 0x80) === 0) return [result, offset];
    shift += 7;
  }
  throw new Error("Truncated varint");
}

function decodeOtpParameters(buf) {
  let offset = 0;
  const entry = { secret: null, name: "", issuer: "", algorithm: 0, digits: 0, type: 0, counter: 0 };

  while (offset < buf.length) {
    const [tag, newOff] = readVarint(buf, offset);
    offset = newOff;
    const fieldNum = tag >>> 3;
    const wireType = tag & 0x07;

    if (wireType === 0) {
      // varint
      const [val, off2] = readVarint(buf, offset);
      offset = off2;
      if (fieldNum === 4) entry.algorithm = val;
      else if (fieldNum === 5) entry.digits = val;
      else if (fieldNum === 6) entry.type = val;
      else if (fieldNum === 7) entry.counter = val;
    } else if (wireType === 2) {
      // length-delimited
      const [len, off2] = readVarint(buf, offset);
      offset = off2;
      const data = buf.slice(offset, offset + len);
      offset += len;
      if (fieldNum === 1) entry.secret = data;
      else if (fieldNum === 2) entry.name = new TextDecoder().decode(data);
      else if (fieldNum === 3) entry.issuer = new TextDecoder().decode(data);
    } else if (wireType === 1) {
      offset += 8; // skip 64-bit
    } else if (wireType === 5) {
      offset += 4; // skip 32-bit
    }
  }

  return entry;
}

function decodeMigrationPayload(buf) {
  let offset = 0;
  const entries = [];

  while (offset < buf.length) {
    const [tag, newOff] = readVarint(buf, offset);
    offset = newOff;
    const fieldNum = tag >>> 3;
    const wireType = tag & 0x07;

    if (wireType === 2) {
      const [len, off2] = readVarint(buf, offset);
      offset = off2;
      const data = buf.slice(offset, offset + len);
      offset += len;
      if (fieldNum === 1) {
        entries.push(decodeOtpParameters(data));
      }
    } else if (wireType === 0) {
      const [, off2] = readVarint(buf, offset);
      offset = off2;
    } else if (wireType === 1) {
      offset += 8;
    } else if (wireType === 5) {
      offset += 4;
    }
  }

  return entries;
}

// ── Base32 decoder ──────────────────────────────────────────────────────────

function base32ToBytes(str) {
  str = str.replace(/=+$/, "").toUpperCase();
  let bits = "";
  for (const c of str) {
    const idx = B32.indexOf(c);
    if (idx < 0) continue;
    bits += idx.toString(2).padStart(5, "0");
  }
  const bytes = new Uint8Array(Math.floor(bits.length / 8));
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2);
  }
  return bytes;
}

// ── Protobuf encoder for MigrationPayload ───────────────────────────────────

function writeVarint(value) {
  const bytes = [];
  while (value > 0x7f) {
    bytes.push((value & 0x7f) | 0x80);
    value >>>= 7;
  }
  bytes.push(value & 0x7f);
  return bytes;
}

function writeTag(fieldNum, wireType) {
  return writeVarint((fieldNum << 3) | wireType);
}

function writeLengthDelimited(fieldNum, data) {
  return [...writeTag(fieldNum, 2), ...writeVarint(data.length), ...data];
}

function writeVarintField(fieldNum, value) {
  return [...writeTag(fieldNum, 0), ...writeVarint(value)];
}

function encodeOtpParameters(account) {
  const secretBytes = base32ToBytes(account.secret);
  const nameBytes = new TextEncoder().encode(account.name || "");
  const issuerBytes = new TextEncoder().encode(account.issuer || "");
  const algo = ALGO_REVERSE[account.algorithm] || 1;
  const digits = DIGITS_REVERSE[account.digits] || 1;
  const isHotp = account.account_type === "hotp";

  return new Uint8Array([
    ...writeLengthDelimited(1, secretBytes),               // secret
    ...writeLengthDelimited(2, nameBytes),                  // name
    ...writeLengthDelimited(3, issuerBytes),                // issuer
    ...(algo !== 1 ? writeVarintField(4, algo) : []),       // algorithm (skip default)
    ...(digits !== 1 ? writeVarintField(5, digits) : []),   // digits (skip default)
    ...writeVarintField(6, isHotp ? 1 : 0),                // type: 0=TOTP, 1=HOTP
    ...(isHotp && account.counter ? writeVarintField(7, account.counter) : []),
  ]);
}

function encodeMigrationPayload(accounts, batchIndex = 0, batchSize = 1) {
  let payload = [];
  for (const acc of accounts) {
    const otpBytes = encodeOtpParameters(acc);
    payload.push(...writeLengthDelimited(1, otpBytes));
  }
  // version = 1
  payload.push(...writeVarintField(2, 1));
  // batch_size
  payload.push(...writeVarintField(3, batchSize));
  // batch_index
  payload.push(...writeVarintField(4, batchIndex));
  return new Uint8Array(payload);
}

/**
 * Build one or more Google Authenticator migration URIs from accounts.
 * Splits into batches of `batchSize` to keep QR codes scannable.
 * Returns an array of URI strings.
 */
export function buildGoogleMigrationUris(accounts, batchSize = 10) {
  if (!accounts.length) return [];
  const batches = [];
  for (let i = 0; i < accounts.length; i += batchSize) {
    batches.push(accounts.slice(i, i + batchSize));
  }
  return batches.map((batch, idx) => {
    const payload = encodeMigrationPayload(batch, idx, batches.length);
    const binary = String.fromCharCode(...payload);
    const b64 = btoa(binary);
    return `otpauth-migration://offline?data=${encodeURIComponent(b64)}`;
  });
}

/**
 * Check if a string is a Google Authenticator migration URI.
 */
export function isGoogleMigrationUri(text) {
  return text.startsWith("otpauth-migration://");
}

/**
 * Parse a Google Authenticator export URI and return an array of account objects.
 */
export function parseGoogleMigration(uri) {
  if (!uri.startsWith("otpauth-migration://")) {
    throw new Error(t("err.not.google.format"));
  }

  const url = new URL(uri.replace("otpauth-migration://", "https://migration/"));
  const dataB64 = url.searchParams.get("data");
  if (!dataB64) throw new Error(t("err.missing.data"));

  const binary = atob(dataB64);
  const buf = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) buf[i] = binary.charCodeAt(i);

  const entries = decodeMigrationPayload(buf);
  if (entries.length === 0) throw new Error(t("err.no.accounts"));

  return entries
    .map((e) => {
      let name = e.name || "";
      let issuer = e.issuer || "";

      // Google often puts "issuer:name" in the name field
      if (!issuer && name.includes(":")) {
        const parts = name.split(":");
        issuer = parts[0].trim();
        name = parts.slice(1).join(":").trim();
      }

      return {
        id: crypto.randomUUID(),
        name,
        issuer,
        secret: e.secret ? bytesToBase32(e.secret) : "",
        algorithm: ALGO_MAP[e.algorithm] || "SHA1",
        digits: DIGITS_MAP[e.digits] || 6,
        period: 30,
        account_type: e.type === 1 ? "hotp" : "totp",
        counter: e.counter || 0,
        icon: null,
      };
    })
    .filter((a) => a.secret); // skip entries without a secret
}
