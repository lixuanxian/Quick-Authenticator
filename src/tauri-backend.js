// ── Tauri Backend (Windows / Android) ─────────────────────────────────────────
// OTP logic is shared with web-backend.js (single JS implementation).
// This file only handles Tauri-specific APIs: storage (plugin-store), clipboard, window controls.

import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { load } from "@tauri-apps/plugin-store";
import { getCurrentWindow } from "@tauri-apps/api/window";

// ── Shared OTP functions (from web-backend.js) ──────────────────────────────
export {
  generateTotp, generateHotp, generateAllTotp,
  parseOtpauthUri, validateSecret, generateNewSecret,
} from './web-backend.js';

// ── Storage (tauri-plugin-store) ─────────────────────────────────────────────
let store;

export async function initStore() {
  store = await load("accounts.json", { autoSave: true });
}

export async function getAccounts() {
  return (await store.get("accounts")) || [];
}

export async function saveAccounts(accounts) {
  await store.set("accounts", accounts);
}

// ── Clipboard ────────────────────────────────────────────────────────────────
export async function copyText(text) {
  await writeText(text);
}

// ── Window controls (desktop only) ───────────────────────────────────────────
export function startDragging() { getCurrentWindow().startDragging(); }
export function closeWindow() { getCurrentWindow().close(); }
export function minimizeWindow() { getCurrentWindow().minimize(); }
export function toggleMaximize() { getCurrentWindow().toggleMaximize(); }
