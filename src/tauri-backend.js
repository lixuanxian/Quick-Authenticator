// ── Tauri Backend (Windows / Android) ─────────────────────────────────────────

import { invoke } from "@tauri-apps/api/core";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { load } from "@tauri-apps/plugin-store";
import { getCurrentWindow } from "@tauri-apps/api/window";

let store;

// Storage
export async function initStore() {
  store = await load("accounts.json", { autoSave: true });
}

export async function getAccounts() {
  return (await store.get("accounts")) || [];
}

export async function saveAccounts(accounts) {
  await store.set("accounts", accounts);
}

// TOTP
export async function generateTotp(account) {
  return invoke("generate_totp", { account });
}

export async function generateHotp(account) {
  return invoke("generate_hotp", { account });
}

export async function generateAllTotp(accounts) {
  return invoke("generate_all_totp", { accounts });
}

export async function parseOtpauthUri(uri) {
  return invoke("parse_otpauth_uri", { uri });
}

export async function validateSecret(secret) {
  return invoke("validate_secret", { secret });
}

export async function generateNewSecret() {
  return invoke("generate_new_secret");
}

// Clipboard
export async function copyText(text) {
  await writeText(text);
}

// Window controls
export function startDragging() { getCurrentWindow().startDragging(); }
export function closeWindow() { getCurrentWindow().close(); }
export function minimizeWindow() { getCurrentWindow().minimize(); }
export function toggleMaximize() { getCurrentWindow().toggleMaximize(); }
