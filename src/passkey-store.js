// ── Passkey / WebAuthn Credential Storage ───────────────────────────────────
// Manages encrypted passkey storage using AES-GCM with a master password.
// Private keys are encrypted at rest; the master password never leaves the device.

import { t } from "./i18n.js";

const PASSKEY_STORAGE_KEY = "totp_authenticator_passkeys";
const MASTER_HASH_KEY = "totp_authenticator_master_hash";

// ── Master Password ─────────────────────────────────────────────────────────

/**
 * Derive an AES-GCM key from the master password using PBKDF2.
 */
async function deriveKey(password, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * Check if a master password has been set.
 */
export function hasMasterPassword() {
  return !!localStorage.getItem(MASTER_HASH_KEY);
}

/**
 * Set the master password for the first time.
 * Stores a salted hash for verification.
 */
export async function setMasterPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(password, salt);

  // Encrypt a known verification string
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const verifyData = new TextEncoder().encode("passkey-verify");
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, verifyData);

  const stored = {
    salt: arrayToBase64(salt),
    iv: arrayToBase64(iv),
    verify: arrayToBase64(new Uint8Array(encrypted)),
  };
  localStorage.setItem(MASTER_HASH_KEY, JSON.stringify(stored));
}

/**
 * Verify the master password. Returns true if correct.
 */
export async function verifyMasterPassword(password) {
  const raw = localStorage.getItem(MASTER_HASH_KEY);
  if (!raw) return false;

  try {
    const stored = JSON.parse(raw);
    const salt = base64ToArray(stored.salt);
    const iv = base64ToArray(stored.iv);
    const encrypted = base64ToArray(stored.verify);
    const key = await deriveKey(password, salt);
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, encrypted);
    const text = new TextDecoder().decode(decrypted);
    return text === "passkey-verify";
  } catch {
    return false;
  }
}

// ── Credential Encryption ───────────────────────────────────────────────────

/**
 * Encrypt a private key with the master password.
 */
export async function encryptPrivateKey(password, privateKeyJwk) {
  const raw = localStorage.getItem(MASTER_HASH_KEY);
  if (!raw) throw new Error(t("err.no.master.pw"));

  const stored = JSON.parse(raw);
  const salt = base64ToArray(stored.salt);
  const key = await deriveKey(password, salt);

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(JSON.stringify(privateKeyJwk));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data);

  return {
    iv: arrayToBase64(iv),
    data: arrayToBase64(new Uint8Array(encrypted)),
  };
}

/**
 * Decrypt a private key with the master password.
 */
export async function decryptPrivateKey(password, encryptedObj) {
  const raw = localStorage.getItem(MASTER_HASH_KEY);
  if (!raw) throw new Error(t("err.no.master.pw"));

  const stored = JSON.parse(raw);
  const salt = base64ToArray(stored.salt);
  const key = await deriveKey(password, salt);

  const iv = base64ToArray(encryptedObj.iv);
  const encrypted = base64ToArray(encryptedObj.data);

  try {
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, encrypted);
    return JSON.parse(new TextDecoder().decode(decrypted));
  } catch {
    throw new Error(t("err.master.pw.wrong"));
  }
}

// ── Passkey CRUD ────────────────────────────────────────────────────────────

/**
 * Get all stored passkeys (without decrypted private keys).
 */
export function getPasskeys() {
  const raw = localStorage.getItem(PASSKEY_STORAGE_KEY);
  return raw ? JSON.parse(raw) : [];
}

/**
 * Save passkeys list.
 */
export function savePasskeys(passkeys) {
  localStorage.setItem(PASSKEY_STORAGE_KEY, JSON.stringify(passkeys));
}

/**
 * Add a new passkey credential.
 */
export function addPasskey(passkey) {
  const passkeys = getPasskeys();
  passkeys.push(passkey);
  savePasskeys(passkeys);
}

/**
 * Delete a passkey by ID.
 */
export function deletePasskey(id) {
  const passkeys = getPasskeys().filter(p => p.id !== id);
  savePasskeys(passkeys);
}

// ── WebAuthn Registration ───────────────────────────────────────────────────

/**
 * Create a new passkey credential for a relying party.
 * Generates a key pair, encrypts the private key, and stores the credential.
 *
 * @param {string} masterPassword - The master password for encryption
 * @param {object} options - Registration options
 * @param {string} options.rpId - Relying party domain (e.g., "example.com")
 * @param {string} options.rpName - Relying party display name
 * @param {string} options.userName - User's name/email
 * @param {string} options.userDisplayName - User's display name
 */
export async function createPasskey(masterPassword, { rpId, rpName, userName, userDisplayName }) {
  // Generate ECDSA P-256 key pair (most widely supported)
  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"]
  );

  // Export keys
  const publicKeyJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
  const privateKeyJwk = await crypto.subtle.exportKey("jwk", keyPair.privateKey);

  // Encrypt private key
  const encryptedPrivateKey = await encryptPrivateKey(masterPassword, privateKeyJwk);

  // Generate credential ID
  const credentialId = arrayToBase64(crypto.getRandomValues(new Uint8Array(32)));

  const passkey = {
    id: crypto.randomUUID(),
    rpId,
    rpName,
    userName,
    userDisplayName: userDisplayName || userName,
    credentialId,
    publicKey: JSON.stringify(publicKeyJwk),
    encryptedPrivateKey,
    counter: 0,
    createdAt: new Date().toISOString(),
    lastUsed: null,
  };

  addPasskey(passkey);
  return passkey;
}

/**
 * Sign a challenge with a passkey's private key.
 *
 * @param {string} masterPassword - The master password to decrypt the key
 * @param {string} passkeyId - The passkey ID
 * @param {Uint8Array} challenge - The challenge bytes to sign
 * @returns {object} - { signature, counter }
 */
export async function signChallenge(masterPassword, passkeyId, challenge) {
  const passkeys = getPasskeys();
  const passkey = passkeys.find(p => p.id === passkeyId);
  if (!passkey) throw new Error(t("err.passkey.not.found"));

  // Decrypt private key
  const privateKeyJwk = await decryptPrivateKey(masterPassword, passkey.encryptedPrivateKey);

  // Import private key
  const privateKey = await crypto.subtle.importKey(
    "jwk", privateKeyJwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );

  // Sign the challenge
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    privateKey,
    challenge
  );

  // Increment counter
  passkey.counter += 1;
  passkey.lastUsed = new Date().toISOString();
  savePasskeys(passkeys);

  return {
    signature: arrayToBase64(new Uint8Array(signature)),
    counter: passkey.counter,
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function arrayToBase64(arr) {
  return btoa(String.fromCharCode(...arr));
}

function base64ToArray(b64) {
  const binary = atob(b64);
  const arr = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
  return arr;
}
