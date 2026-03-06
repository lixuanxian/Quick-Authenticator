// ── Platform Detection & API Dispatch ────────────────────────────────────────

import { startScanner, stopScanner, scanFromImage, scanFromScreen, generateQrDataUrl, generateMigrationQrDataUrls } from "./qr.js";

const isTauri = typeof window !== 'undefined' && !!window.__TAURI_INTERNALS__;
const ua = navigator.userAgent.toLowerCase();
const isMobile = /android|iphone|ipad|ipod/.test(ua);

const backend = isTauri
  ? await import('./tauri-backend.js')
  : await import('./web-backend.js');

export const platform = {
  isTauri,
  isDesktop: isTauri && !isMobile,
  isMobile,
  isWeb: !isTauri,

  // TOTP / HOTP
  generateTotp: backend.generateTotp,
  generateHotp: backend.generateHotp,
  generateAllTotp: backend.generateAllTotp,
  parseOtpauthUri: backend.parseOtpauthUri,
  validateSecret: backend.validateSecret,
  generateNewSecret: backend.generateNewSecret,

  // Storage
  initStore: backend.initStore,
  getAccounts: backend.getAccounts,
  saveAccounts: backend.saveAccounts,

  // Clipboard
  copyText: backend.copyText,

  // Window controls (desktop only)
  startDragging: backend.startDragging,
  closeWindow: backend.closeWindow,
  minimizeWindow: backend.minimizeWindow,
  toggleMaximize: backend.toggleMaximize,

  // QR Code
  startScanner,
  stopScanner,
  scanFromImage,
  scanFromScreen,
  generateQrDataUrl,
  generateMigrationQrDataUrls,
};
