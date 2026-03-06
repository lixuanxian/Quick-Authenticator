import { platform } from "./platform.js";
import { parseOktaVerifyUri, activateOktaVerify, isOktaVerifyUri } from "./okta-activate.js";
import { parseGoogleMigration, isGoogleMigrationUri } from "./google-migrate.js";
import { parseDuoUri, activateDuo, isDuoUri } from "./duo-activate.js";
import { hasMasterPassword, setMasterPassword, verifyMasterPassword, createPasskey, signChallenge, getPasskeys, deletePasskey } from "./passkey-store.js";
import { isPushSupported, getPushPermission, subscribePush, unsubscribePush, getCurrentSubscription, onPushAction, saveVapidKey, getPushConfig, respondToPush } from "./push-service.js";
import { t, initLang, setLang, getLang, cssVar } from "./i18n.js";

// ── State ──────────────────────────────────────────────────────────────────
let accounts = [];
let view = "home"; // home | add | edit | passkeys | add-passkey | push-settings
let editingId = null;
let searchQuery = "";
let copiedId = null;
let tickInterval = null;

// ── Theme ─────────────────────────────────────────────────────────────────
const THEME_STORAGE_KEY = "totp_authenticator_theme";
const THEME_BG = { dark: "#161b22", light: "#f6f8fa" };

function initTheme() {
  const saved = localStorage.getItem(THEME_STORAGE_KEY);
  if (saved) {
    document.documentElement.setAttribute("data-theme", saved);
  } else if (window.matchMedia("(prefers-color-scheme: light)").matches) {
    document.documentElement.setAttribute("data-theme", "light");
  }
  // Sync Android native status bar area background with current theme
  syncAndroidStatusBar();
}

function syncAndroidStatusBar() {
  const theme = document.documentElement.getAttribute("data-theme") || "dark";
  const color = THEME_BG[theme];
  if (window.AndroidBridge?.setStatusBarColor) {
    window.AndroidBridge.setStatusBarColor(color);
  } else if (/Android/i.test(navigator.userAgent)) {
    // Bridge may not be attached yet, retry
    setTimeout(() => {
      if (window.AndroidBridge?.setStatusBarColor) {
        window.AndroidBridge.setStatusBarColor(color);
      }
    }, 500);
  }
}

function getTheme() {
  return document.documentElement.getAttribute("data-theme") || "dark";
}

function toggleTheme() {
  const next = getTheme() === "light" ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem(THEME_STORAGE_KEY, next);
  syncAndroidStatusBar();
  render();
}

function toggleLang() {
  setLang(getLang() === "zh" ? "en" : "zh");
  document.title = t("app.name");
  render();
}

window.matchMedia("(prefers-color-scheme: light)").addEventListener("change", (e) => {
  if (!localStorage.getItem(THEME_STORAGE_KEY)) {
    document.documentElement.setAttribute("data-theme", e.matches ? "light" : "dark");
  }
});

// ── Store ──────────────────────────────────────────────────────────────────
async function initStore() {
  await platform.initStore();
  accounts = await platform.getAccounts();
}

async function saveAccounts() {
  await platform.saveAccounts(accounts);
}

// ── OTP Code Refresh ────────────────────────────────────────────────────────
async function refreshCodes() {
  if (!accounts.length) return;

  // Refresh HOTP codes (generate current code without incrementing)
  for (const acc of accounts) {
    if (acc.account_type !== "hotp") continue;
    try {
      const result = await platform.generateHotp(acc);
      const el = document.querySelector(`[data-id="${acc.id}"]`);
      if (!el) continue;
      const codeEl = el.querySelector(".code");
      if (codeEl && codeEl.textContent === "······") {
        const formatted = result.code.length === 6
          ? result.code.slice(0, 3) + " " + result.code.slice(3)
          : result.code;
        codeEl.textContent = formatted;
      }
    } catch (e) { /* skip */ }
  }

  // Refresh TOTP codes
  try {
    const results = await platform.generateAllTotp(accounts);
    results.forEach(([id, result]) => {
      if (result.status === "ok" || result.Ok) {
        const data = result.Ok || result;
        const el = document.querySelector(`[data-id="${id}"]`);
        if (!el) return;
        const codeEl = el.querySelector(".code");
        const timerEl = el.querySelector(".timer-ring-progress");
        const secsEl = el.querySelector(".secs");
        if (codeEl) {
          const formatted = data.code.length === 6
            ? data.code.slice(0, 3) + " " + data.code.slice(3)
            : data.code;
          codeEl.textContent = formatted;
          codeEl.classList.toggle("urgent", data.remaining <= 5);
        }
        if (timerEl) {
          const circumference = 2 * Math.PI * 16;
          timerEl.style.strokeDashoffset = circumference * (1 - data.progress);
          timerEl.style.stroke = data.remaining <= 5 ? cssVar("--timer-danger") : data.remaining <= 10 ? cssVar("--timer-warn") : cssVar("--timer-ok");
        }
        if (secsEl) secsEl.textContent = data.remaining + "s";
      }
    });
  } catch (e) {
    console.error("refresh error", e);
  }
}

// ── Render ─────────────────────────────────────────────────────────────────
function render() {
  const app = document.getElementById("app");
  app.innerHTML = "";

  const shell = document.createElement("div");
  shell.className = "shell";
  shell.innerHTML = renderShell();
  app.appendChild(shell);

  // titlebar drag (desktop only)
  if (platform.isDesktop) {
    const titlebar = shell.querySelector(".titlebar");
    if (titlebar) {
      titlebar.addEventListener("mousedown", (e) => {
        if (!e.target.closest("button")) platform.startDragging();
      });
    }
    shell.querySelector("#btn-close")?.addEventListener("click", () => platform.closeWindow());
    shell.querySelector("#btn-minimize")?.addEventListener("click", () => platform.minimizeWindow());
    shell.querySelector("#btn-maximize")?.addEventListener("click", () => platform.toggleMaximize());
  }
  shell.querySelector("#btn-theme")?.addEventListener("click", toggleTheme);
  shell.querySelector("#btn-lang")?.addEventListener("click", toggleLang);

  if (view === "home") renderHome(shell);
  else if (view === "add") renderForm(shell, false);
  else if (view === "edit") renderForm(shell, true);
  else if (view === "passkeys") renderPasskeys(shell);
  else if (view === "add-passkey") renderAddPasskey(shell);
  else if (view === "push-settings") renderPushSettings(shell);

  // Start ticking
  clearInterval(tickInterval);
  tickInterval = setInterval(refreshCodes, 1000);
  refreshCodes();
}

function renderShell() {
  const titleIcon = `<svg width="18" height="18" viewBox="0 0 512 512"><defs><linearGradient id="ti" x1=".5" y1="0" x2=".5" y2="1"><stop offset="0%" stop-color="#34d399"/><stop offset="100%" stop-color="#059669"/></linearGradient></defs><path d="M256 80 L110 148 V280 C110 378 256 452 256 452 S402 378 402 280 V148 Z" fill="#10b981" fill-opacity=".10"/><path d="M256 80 L110 148 V280 C110 378 256 452 256 452 S402 378 402 280 V148 Z" fill="none" stroke="url(#ti)" stroke-width="12" stroke-linejoin="round"/><path d="M224 253 V230 A32 32 0 0 1 288 230 V253" fill="none" stroke="url(#ti)" stroke-width="14" stroke-linecap="round"/><rect x="202" y="253" width="108" height="82" rx="12" fill="url(#ti)"/><circle cx="256" cy="284" r="14" fill="var(--bg2)"/><path d="M248 292 L256 323 L264 292 Z" fill="var(--bg2)"/></svg>`;
  const sunIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`;
  const moonIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
  const themeIcon = getTheme() === "dark" ? sunIcon : moonIcon;
  const langLabel = getLang() === "zh" ? "EN" : "中";

  if (platform.isDesktop) {
    return `
<div class="titlebar" data-tauri-drag-region>
  <div class="titlebar-title" data-tauri-drag-region>${titleIcon} ${t("app.name")}</div>
  <div class="titlebar-actions" data-tauri-drag-region>
    <button id="btn-theme" class="tb-btn" title="${t("settings.theme")}">${themeIcon}</button>
    <button id="btn-lang" class="tb-btn" title="${t("settings.language")}">${langLabel}</button>
  </div>
  <div class="titlebar-controls" data-tauri-drag-region>
    <button id="btn-minimize" class="tb-btn">─</button>
    <button id="btn-maximize" class="tb-btn">□</button>
    <button id="btn-close" class="tb-btn close">✕</button>
  </div>
</div>
<div class="content" id="main-content"></div>`;
  }

  return `
<div class="app-header">
  <div class="titlebar-title">${titleIcon} ${t("app.name")}</div>
  <div class="titlebar-actions">
    <button id="btn-theme" class="tb-btn" title="${t("settings.theme")}">${themeIcon}</button>
    <button id="btn-lang" class="tb-btn" title="${t("settings.language")}">${langLabel}
  </div>
</div>
<div class="content" id="main-content"></div>`;
}

function renderHome(shell) {
  const content = shell.querySelector("#main-content");
  const filtered = accounts.filter(a =>
    !searchQuery ||
    a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    a.issuer.toLowerCase().includes(searchQuery.toLowerCase())
  );

  content.innerHTML = `
<div class="nav-tabs">
  <button class="nav-btn active" data-nav="otp">
    <svg width="14" height="14" viewBox="0 0 512 512"><defs><linearGradient id="oti" x1=".5" y1="0" x2=".5" y2="1"><stop offset="0%" stop-color="#34d399"/><stop offset="100%" stop-color="#059669"/></linearGradient></defs><path d="M256 80 L110 148 V280 C110 378 256 452 256 452 S402 378 402 280 V148 Z" fill="#10b981" fill-opacity=".10"/><path d="M256 80 L110 148 V280 C110 378 256 452 256 452 S402 378 402 280 V148 Z" fill="none" stroke="url(#oti)" stroke-width="12" stroke-linejoin="round"/><path d="M224 253 V230 A32 32 0 0 1 288 230 V253" fill="none" stroke="url(#oti)" stroke-width="14" stroke-linecap="round"/><rect x="202" y="253" width="108" height="82" rx="12" fill="url(#oti)"/><circle cx="256" cy="284" r="14" fill="var(--bg2)"/><path d="M248 292 L256 323 L264 292 Z" fill="var(--bg2)"/></svg>
    OTP
  </button>
  <button class="nav-btn" data-nav="passkeys">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>
    Passkey
  </button>
</div>
<div class="toolbar">
  <div class="search-wrap">
    <svg class="search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
    </svg>
    <input id="search" class="search" placeholder="${t("search.placeholder")}" value="${searchQuery}" />
  </div>
  <button class="btn-export" id="btn-export" title="${t("export.title")}">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
  </button>
  <button class="btn-add" id="btn-add-account" title="${t("add.account")}">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
    </svg>
  </button>
</div>

<div class="accounts-list" id="accounts-list">
  ${filtered.length === 0 ? renderEmpty() : filtered.map(renderAccountCard).join("")}
</div>
`;

  content.querySelector("#search")?.addEventListener("input", e => {
    searchQuery = e.target.value;
    render();
  });

  content.querySelectorAll(".nav-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      if (btn.dataset.nav === "passkeys") { view = "passkeys"; render(); }
    });
  });

  content.querySelector("#btn-add-account")?.addEventListener("click", () => {
    view = "add";
    render();
  });

  content.querySelector("#btn-export")?.addEventListener("click", () => {
    if (accounts.length === 0) { showAlert(t("no.accounts")); return; }
    showMigrationExportModal();
  });

  filtered.forEach(acc => {
    const card = content.querySelector(`[data-id="${acc.id}"]`);
    if (!card) return;
    card.querySelector(".btn-copy")?.addEventListener("click", () => copyCode(acc));
    card.querySelector(".btn-qr")?.addEventListener("click", (e) => {
      e.stopPropagation();
      showQrModal(acc);
    });
    card.querySelector(".btn-edit")?.addEventListener("click", (e) => {
      e.stopPropagation();
      editingId = acc.id;
      view = "edit";
      render();
    });
    card.querySelector(".btn-delete")?.addEventListener("click", (e) => {
      e.stopPropagation();
      deleteAccount(acc.id);
    });
    card.querySelector(".btn-hotp-refresh")?.addEventListener("click", (e) => {
      e.stopPropagation();
      refreshHotpCode(acc.id);
    });
  });
}

function renderEmpty() {
  return `
<div class="empty">
  <div class="empty-icon">
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    </svg>
  </div>
  <p class="empty-title">${t("empty.title")}</p>
  <p class="empty-sub">${t("empty.sub")}</p>
</div>`;
}

function renderAccountCard(acc) {
  const circumference = 2 * Math.PI * 16;
  const initials = (acc.issuer || acc.name || "?").slice(0, 2).toUpperCase();
  const color = stringToColor(acc.issuer + acc.name);
  const isHotp = acc.account_type === "hotp";

  const timerOrRefresh = isHotp
    ? `<button class="btn-hotp-refresh" data-id="${acc.id}" title="${t("hotp.refresh")}">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
        </svg>
      </button>`
    : `<div class="timer-ring">
        <svg width="40" height="40" viewBox="0 0 40 40">
          <circle cx="20" cy="20" r="16" fill="none" stroke="var(--ring-bg)" stroke-width="2.5"/>
          <circle class="timer-ring-progress" cx="20" cy="20" r="16" fill="none"
            stroke="var(--timer-ok)" stroke-width="2.5"
            stroke-dasharray="${circumference}"
            stroke-dashoffset="${circumference * 0.5}"
            stroke-linecap="round"
            transform="rotate(-90 20 20)"
            style="transition: stroke-dashoffset 0.8s linear, stroke 0.3s"/>
          <text class="secs" x="20" y="24" text-anchor="middle" font-size="9" fill="var(--ring-text)" font-family="JetBrains Mono">--s</text>
        </svg>
      </div>`;

  const typeBadge = isHotp ? `<span class="type-badge hotp">HOTP</span>` : "";

  return `
<div class="account-card${isHotp ? " hotp-card" : ""}" data-id="${acc.id}">
  <div class="card-left">
    <div class="avatar" style="background:${color}">
      ${getProviderIcon(acc.issuer) || initials}
    </div>
    <div class="card-info">
      <span class="card-issuer">${esc(acc.issuer || t("unknown.service"))}${typeBadge}</span>
      <span class="card-name">${esc(acc.name)}</span>
    </div>
  </div>
  <div class="card-right">
    ${timerOrRefresh}
    <button class="btn-copy code" data-id="${acc.id}">······</button>
    <div class="card-actions">
      <button class="btn-icon btn-qr" title="${t("show.qr")}">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="2" y="2" width="8" height="8" rx="1"/><rect x="14" y="2" width="8" height="8" rx="1"/>
          <rect x="2" y="14" width="8" height="8" rx="1"/><rect x="14" y="14" width="4" height="4"/>
          <line x1="22" y1="14" x2="22" y2="22"/><line x1="14" y1="22" x2="22" y2="22"/>
        </svg>
      </button>
      <button class="btn-icon btn-edit" title="${t("edit")}">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>
      </button>
      <button class="btn-icon btn-delete" title="${t("delete")}">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
          <path d="M10 11v6"/><path d="M14 11v6"/>
        </svg>
      </button>
    </div>
  </div>
</div>`;
}

async function handleScannedText(text) {
  if (text.startsWith("otpauth://") && !isOktaVerifyUri(text)) {
    try {
      const account = await platform.parseOtpauthUri(text);
      accounts.push(account);
      await saveAccounts();
      view = "home";
      render();
    } catch (e) {
      showAlert(t("alert.parse.failed") + e);
    }
  } else if (isOktaVerifyUri(text)) {
    showActivatingModal("Okta Verify");
    try {
      const params = parseOktaVerifyUri(text);
      const account = await activateOktaVerify(params);
      accounts.push(account);
      await saveAccounts();
      closeActivatingModal();
      view = "home";
      render();
    } catch (e) {
      closeActivatingModal();
      showAlert(t("alert.okta.failed") + e.message);
    }
  } else if (isDuoUri(text)) {
    showActivatingModal("Duo Mobile");
    try {
      const params = parseDuoUri(text);
      const account = await activateDuo(params);
      accounts.push(account);
      await saveAccounts();
      closeActivatingModal();
      view = "home";
      render();
    } catch (e) {
      closeActivatingModal();
      showAlert(t("alert.duo.failed") + e.message);
    }
  } else if (isGoogleMigrationUri(text)) {
    try {
      const imported = parseGoogleMigration(text);
      const existing = new Set(accounts.map(a => `${a.issuer}|${a.name}|${a.secret}`));
      const newAccounts = imported.filter(a => !existing.has(`${a.issuer}|${a.name}|${a.secret}`));
      if (newAccounts.length === 0) {
        showAlert(t("alert.import.all.exist", imported.length));
        return;
      }
      accounts.push(...newAccounts);
      await saveAccounts();
      view = "home";
      render();
      showAlert(t("alert.import.success", newAccounts.length, imported.length - newAccounts.length));
    } catch (e) {
      showAlert(t("alert.import.failed") + e.message);
    }
  } else {
    showAlert(t("alert.unsupported.qr"));
  }
}

function renderForm(shell, isEdit) {
  const acc = isEdit ? accounts.find(a => a.id === editingId) : null;
  const content = shell.querySelector("#main-content");

  content.innerHTML = `
<div class="form-header">
  <button class="btn-back" id="btn-back">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
      <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
    </svg>
  </button>
  <h2 class="form-title">${isEdit ? t("form.title.edit") : t("form.title.add")}</h2>
</div>

${!isEdit ? `<div class="form-tabs">
  <button class="tab-btn active" data-tab="scan">${t("tab.scan")}</button>
  <button class="tab-btn" data-tab="manual">${t("tab.manual")}</button>
  <button class="tab-btn" data-tab="url">${t("tab.url")}</button>
</div>` : ""}

<div id="tab-scan" class="tab-content${isEdit ? " hidden" : ""}">
  <button class="btn-scan" id="btn-scan-qr">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
      <circle cx="12" cy="13" r="4"/>
    </svg>
    ${t("btn.scan")}
  </button>
  <button class="btn-scan" id="btn-upload-image">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
      <circle cx="8.5" cy="8.5" r="1.5"/>
      <polyline points="21 15 16 10 5 21"/>
    </svg>
    ${t("btn.upload.image")}
  </button>
  <input type="file" id="qr-file-input" accept="image/*" style="display:none" />
  ${platform.isMobile ? "" : `<button class="btn-scan" id="btn-scan-screen">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
      <line x1="8" y1="21" x2="16" y2="21"/>
      <line x1="12" y1="17" x2="12" y2="21"/>
    </svg>
    ${t("btn.scan.screen")}
  </button>`}
  <p class="field-hint">${platform.isMobile ? t("scan.hint.mobile") : t("scan.hint")}</p>
</div>

<div id="tab-manual" class="tab-content${isEdit ? "" : " hidden"}">
  <div class="form-group">
    <label>${t("label.type")}</label>
    <div class="type-toggle">
      <button class="type-btn${(acc?.account_type || "totp") === "totp" ? " active" : ""}" data-type="totp">${t("type.totp")}</button>
      <button class="type-btn${acc?.account_type === "hotp" ? " active" : ""}" data-type="hotp">${t("type.hotp")}</button>
    </div>
  </div>
  <div class="form-group">
    <label>${t("label.name")}</label>
    <input type="text" id="f-name" placeholder="user@example.com" value="${esc(acc?.name || "")}" />
  </div>
  <div class="form-group">
    <label>${t("label.issuer")}</label>
    <div class="issuer-combo">
      <div class="issuer-chips" id="issuer-chips">
        ${["Google","Okta","GitHub","Microsoft","Amazon","Apple","Facebook","Dropbox"].map(name =>
          `<button class="issuer-chip${(acc?.issuer||"")=== name ? " active":""}" data-issuer="${name}">${name}</button>`
        ).join("")}
      </div>
      <input type="text" id="f-issuer" placeholder="${t("issuer.placeholder")}" value="${esc(acc?.issuer || "")}" />
    </div>
  </div>
  <div class="form-group">
    <label>${t("label.secret")}</label>
    <div class="secret-wrap">
      <input type="text" id="f-secret" placeholder="JBSWY3DPEHPK3PXP" value="${esc(acc?.secret || "")}" class="mono" autocomplete="off" />
      ${!isEdit ? `<button class="btn-gen" id="btn-gen-secret" title="${t("gen.secret")}">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
        </svg>
      </button>` : ""}
    </div>
    <span class="field-hint" id="secret-hint"></span>
  </div>
  <div class="form-row">
    <div class="form-group">
      <label>${t("label.algo")}</label>
      <select id="f-algo">
        <option value="SHA1" ${(acc?.algorithm || "SHA1") === "SHA1" ? "selected" : ""}>${t("algo.default")}</option>
        <option value="SHA256" ${acc?.algorithm === "SHA256" ? "selected" : ""}>SHA256</option>
        <option value="SHA512" ${acc?.algorithm === "SHA512" ? "selected" : ""}>SHA512</option>
      </select>
    </div>
    <div class="form-group">
      <label>${t("label.digits")}</label>
      <select id="f-digits">
        <option value="6" ${(acc?.digits || 6) === 6 ? "selected" : ""}>${t("digits.6")}</option>
        <option value="8" ${acc?.digits === 8 ? "selected" : ""}>${t("digits.8")}</option>
      </select>
    </div>
    <div class="form-group totp-field">
      <label>${t("label.period")}</label>
      <select id="f-period">
        <option value="30" ${(acc?.period || 30) === 30 ? "selected" : ""}>30s</option>
        <option value="60" ${acc?.period === 60 ? "selected" : ""}>60s</option>
      </select>
    </div>
    <div class="form-group hotp-field" style="display:none">
      <label>${t("label.counter")}</label>
      <input type="number" id="f-counter" value="${acc?.counter || 0}" min="0" />
    </div>
  </div>
  <button class="btn-submit" id="btn-submit">${isEdit ? t("btn.submit.edit") : t("btn.submit.add")}</button>
</div>

<div id="tab-url" class="tab-content hidden">
  <div class="form-group">
    <label>${t("label.uri")}</label>
    <textarea id="f-uri" placeholder="${t("uri.placeholder")}" rows="4"></textarea>
    <span class="field-hint">${t("uri.hint")}</span>
  </div>
  <button class="btn-submit" id="btn-import-uri">${t("btn.import")}</button>
</div>
`;

  content.querySelector("#btn-back")?.addEventListener("click", () => {
    view = "home";
    render();
  });

  // Tabs
  content.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      content.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      content.querySelectorAll(".tab-content").forEach(t => t.classList.add("hidden"));
      content.querySelector(`#tab-${btn.dataset.tab}`)?.classList.remove("hidden");
    });
  });

  // Issuer chips
  const issuerInput = content.querySelector("#f-issuer");
  content.querySelectorAll(".issuer-chip").forEach(chip => {
    chip.addEventListener("click", () => {
      content.querySelectorAll(".issuer-chip").forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      issuerInput.value = chip.dataset.issuer;
    });
  });
  issuerInput?.addEventListener("input", () => {
    content.querySelectorAll(".issuer-chip").forEach(c =>
      c.classList.toggle("active", c.dataset.issuer === issuerInput.value)
    );
  });

  // Type toggle (TOTP/HOTP)
  let selectedType = acc?.account_type || "totp";
  function updateTypeFields() {
    content.querySelectorAll(".totp-field").forEach(el => el.style.display = selectedType === "totp" ? "" : "none");
    content.querySelectorAll(".hotp-field").forEach(el => el.style.display = selectedType === "hotp" ? "" : "none");
  }
  content.querySelectorAll(".type-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      content.querySelectorAll(".type-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      selectedType = btn.dataset.type;
      updateTypeFields();
    });
  });
  updateTypeFields();

  // Secret validation
  const secretInput = content.querySelector("#f-secret");
  const secretHint = content.querySelector("#secret-hint");
  secretInput?.addEventListener("input", async () => {
    const val = secretInput.value.trim();
    if (!val) { secretHint.textContent = ""; secretHint.className = "field-hint"; return; }
    const valid = await platform.validateSecret(val);
    secretHint.textContent = valid ? t("secret.valid") : t("secret.invalid");
    secretHint.className = "field-hint " + (valid ? "hint-ok" : "hint-err");
  });

  // Generate secret
  content.querySelector("#btn-gen-secret")?.addEventListener("click", async () => {
    const newSecret = await platform.generateNewSecret();
    content.querySelector("#f-secret").value = newSecret;
    secretHint.textContent = t("secret.generated");
    secretHint.className = "field-hint hint-ok";
  });

  // Submit manual form
  content.querySelector("#btn-submit")?.addEventListener("click", async () => {
    const name = content.querySelector("#f-name").value.trim();
    const secret = content.querySelector("#f-secret").value.trim().toUpperCase().replace(/\s/g, "");
    if (!name || !secret) { showAlert(t("alert.name.secret.required")); return; }
    const valid = await platform.validateSecret(secret);
    if (!valid) { showAlert(t("alert.invalid.secret")); return; }

    const account = {
      id: isEdit ? editingId : crypto.randomUUID(),
      name,
      issuer: content.querySelector("#f-issuer").value.trim(),
      secret,
      algorithm: content.querySelector("#f-algo").value,
      digits: parseInt(content.querySelector("#f-digits").value),
      period: parseInt(content.querySelector("#f-period").value),
      account_type: selectedType,
      counter: selectedType === "hotp" ? parseInt(content.querySelector("#f-counter").value || "0") : 0,
      icon: null,
    };

    if (isEdit) {
      const idx = accounts.findIndex(a => a.id === editingId);
      if (idx >= 0) accounts[idx] = account;
    } else {
      accounts.push(account);
    }
    await saveAccounts();
    view = "home";
    render();
  });

  // QR scan (camera)
  content.querySelector("#btn-scan-qr")?.addEventListener("click", () => showScannerModal());

  // QR scan (image upload)
  const fileInput = content.querySelector("#qr-file-input");
  content.querySelector("#btn-upload-image")?.addEventListener("click", () => fileInput?.click());
  fileInput?.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    fileInput.value = "";
    try {
      const text = await platform.scanFromImage(file);
      await handleScannedText(text);
    } catch (e) {
      showAlert(t("alert.no.qr.found"));
    }
  });

  // QR scan (screen capture)
  content.querySelector("#btn-scan-screen")?.addEventListener("click", async () => {
    try {
      const text = await platform.scanFromScreen();
      await handleScannedText(text);
    } catch (e) {
      if (e.name === "NotAllowedError") return; // user cancelled
      showAlert(t("alert.no.qr.screen"));
    }
  });

  // URI import
  content.querySelector("#btn-import-uri")?.addEventListener("click", async () => {
    const uri = content.querySelector("#f-uri").value.trim();
    if (!uri) return;

    if (isOktaVerifyUri(uri)) {
      showActivatingModal("Okta Verify");
      try {
        const params = parseOktaVerifyUri(uri);
        const account = await activateOktaVerify(params);
        accounts.push(account);
        await saveAccounts();
        closeActivatingModal();
        view = "home";
        render();
      } catch (e) {
        closeActivatingModal();
        showAlert(t("alert.okta.failed") + e.message);
      }
      return;
    }

    if (isDuoUri(uri)) {
      showActivatingModal("Duo Mobile");
      try {
        const params = parseDuoUri(uri);
        const account = await activateDuo(params);
        accounts.push(account);
        await saveAccounts();
        closeActivatingModal();
        view = "home";
        render();
      } catch (e) {
        closeActivatingModal();
        showAlert(t("alert.duo.failed") + e.message);
      }
      return;
    }

    if (isGoogleMigrationUri(uri)) {
      try {
        const imported = parseGoogleMigration(uri);
        const existing = new Set(accounts.map(a => `${a.issuer}|${a.name}|${a.secret}`));
        const newAccounts = imported.filter(a => !existing.has(`${a.issuer}|${a.name}|${a.secret}`));
        if (newAccounts.length === 0) {
          showAlert(t("alert.import.all.exist", imported.length));
          return;
        }
        accounts.push(...newAccounts);
        await saveAccounts();
        view = "home";
        render();
        showAlert(t("alert.import.success", newAccounts.length, imported.length - newAccounts.length));
      } catch (e) {
        showAlert(t("alert.import.failed") + e.message);
      }
      return;
    }

    try {
      const account = await platform.parseOtpauthUri(uri);
      accounts.push(account);
      await saveAccounts();
      view = "home";
      render();
    } catch (e) {
      showAlert(t("alert.parse.failed") + e);
    }
  });
}

// ── QR Modals ─────────────────────────────────────────────────────────────
function closeModal() {
  platform.stopScanner();
  document.querySelector(".modal-overlay")?.remove();
}

function showActivatingModal(service) {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.id = "activating-modal";
  overlay.innerHTML = `
<div class="modal" style="text-align:center">
  <div class="modal-header">
    <span class="modal-title">${esc(service)} ${t("activating")}</span>
  </div>
  <div style="padding:24px 0">
    <div class="spinner"></div>
    <p style="margin-top:14px;color:var(--text2);font-size:12px">${t("activating.message")}</p>
  </div>
</div>`;
  document.body.appendChild(overlay);
}

function closeActivatingModal() {
  document.querySelector("#activating-modal")?.remove();
}

function showScannerModal() {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
<div class="modal">
  <div class="modal-header">
    <span class="modal-title">${t("modal.scan.title")}</span>
    <button class="modal-close" id="modal-close">✕</button>
  </div>
  <div id="qr-reader"></div>
  <p class="modal-hint">${t("modal.scan.hint")}</p>
</div>`;
  document.body.appendChild(overlay);

  overlay.addEventListener("click", (e) => { if (e.target === overlay) closeModal(); });
  overlay.querySelector("#modal-close").addEventListener("click", closeModal);

  platform.startScanner("qr-reader", {
    onSuccess: (uri) => { closeModal(); handleScannedText(uri); },
    onOkta: (text) => { closeModal(); handleScannedText(text); },
    onDuo: (text) => { closeModal(); handleScannedText(text); },
    onGoogleMigration: (text) => { closeModal(); handleScannedText(text); },
    onUnsupported: () => { closeModal(); showAlert(t("alert.unsupported.qr")); },
  }).catch((e) => {
    closeModal();
    const denied = String(e).includes("NotAllowedError") || String(e).includes("Permission");
    showAlert(denied ? t("alert.camera.denied") : t("alert.camera.failed") + e);
  });
}

async function showQrModal(acc) {
  try {
    const dataUrl = await platform.generateQrDataUrl(acc);
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
<div class="modal">
  <div class="modal-header">
    <span class="modal-title">${t("modal.export.qr")}</span>
    <button class="modal-close" id="modal-close">✕</button>
  </div>
  <img class="qr-image" src="${dataUrl}" alt="QR Code" />
  <div class="qr-info">
    <span class="qr-issuer">${esc(acc.issuer || t("unknown.service"))}</span>
    <span class="qr-name">${esc(acc.name)}</span>
  </div>
</div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) closeModal(); });
    overlay.querySelector("#modal-close").addEventListener("click", closeModal);
  } catch (e) {
    showAlert(t("alert.qr.failed") + e);
  }
}

async function showMigrationExportModal() {
  try {
    const qrUrls = await platform.generateMigrationQrDataUrls(accounts);
    const total = qrUrls.length;
    let current = 0;

    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";

    function renderPage() {
      overlay.innerHTML = `
<div class="modal">
  <div class="modal-header">
    <span class="modal-title">${t("modal.export.migration")}</span>
    <button class="modal-close" id="modal-close">✕</button>
  </div>
  <img class="qr-image" src="${qrUrls[current]}" alt="Migration QR" />
  ${total > 1 ? `
  <div class="migration-pager">
    <button class="btn-page btn-prev" id="btn-prev" ${current === 0 ? "disabled" : ""}>‹</button>
    <span class="page-info">${current + 1} / ${total}</span>
    <button class="btn-page btn-next" id="btn-next" ${current === total - 1 ? "disabled" : ""}>›</button>
  </div>` : ""}
  <p class="modal-hint">${t("modal.migration.hint", total)}</p>
  <p class="modal-hint" style="margin-top:4px;font-size:10px;opacity:0.6">${t("modal.migration.count", accounts.length)}</p>
</div>`;

      overlay.addEventListener("click", (e) => { if (e.target === overlay) closeModal(); });
      overlay.querySelector("#modal-close").addEventListener("click", closeModal);

      if (total > 1) {
        overlay.querySelector("#btn-prev")?.addEventListener("click", () => {
          if (current > 0) { current--; renderPage(); }
        });
        overlay.querySelector("#btn-next")?.addEventListener("click", () => {
          if (current < total - 1) { current++; renderPage(); }
        });
      }
    }

    document.body.appendChild(overlay);
    renderPage();
  } catch (e) {
    showAlert(t("alert.export.failed") + e);
  }
}

// ── Actions ────────────────────────────────────────────────────────────────
async function refreshHotpCode(id) {
  const acc = accounts.find(a => a.id === id);
  if (!acc || acc.account_type !== "hotp") return;
  acc.counter = (acc.counter || 0) + 1;
  await saveAccounts();
  try {
    const result = await platform.generateHotp(acc);
    const el = document.querySelector(`[data-id="${id}"]`);
    if (!el) return;
    const codeEl = el.querySelector(".code");
    if (codeEl) {
      const formatted = result.code.length === 6
        ? result.code.slice(0, 3) + " " + result.code.slice(3)
        : result.code;
      codeEl.textContent = formatted;
    }
  } catch (e) { console.error("HOTP refresh error", e); }
}

async function copyCode(acc) {
  try {
    const result = acc.account_type === "hotp"
      ? await platform.generateHotp(acc)
      : await platform.generateTotp(acc);
    await platform.copyText(result.code);
    const btn = document.querySelector(`[data-id="${acc.id}"] .btn-copy`);
    if (btn) {
      const orig = btn.textContent;
      btn.textContent = t("copied");
      btn.classList.add("copied");
      setTimeout(() => { btn.classList.remove("copied"); }, 1500);
    }
  } catch (e) { console.error(e); }
}

async function deleteAccount(id) {
  if (!await showConfirm(t("confirm.delete.account"))) return;
  accounts = accounts.filter(a => a.id !== id);
  await saveAccounts();
  render();
}

// ── Helpers ────────────────────────────────────────────────────────────────
function showAlert(msg) {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
<div class="modal">
  <div class="modal-header">
    <span class="modal-title">${t("app.name") || ""}</span>
    <button class="modal-close" id="modal-close">&times;</button>
  </div>
  <div style="font-size:13px;color:var(--text);word-break:break-word;white-space:pre-wrap">${esc(String(msg))}</div>
  <button class="btn-submit" id="alert-ok" style="margin-top:4px">OK</button>
</div>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelector("#modal-close").addEventListener("click", close);
  overlay.querySelector("#alert-ok").addEventListener("click", close);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
}

function showConfirm(msg) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
<div class="modal">
  <div class="modal-header">
    <span class="modal-title">${t("app.name") || ""}</span>
    <button class="modal-close" id="modal-close">&times;</button>
  </div>
  <div style="font-size:13px;color:var(--text);word-break:break-word;white-space:pre-wrap">${esc(String(msg))}</div>
  <div style="display:flex;gap:8px;margin-top:4px">
    <button class="btn-submit" id="confirm-cancel" style="flex:1;background:var(--bg3);color:var(--text2)">${getLang() === "zh-CN" ? "取消" : "Cancel"}</button>
    <button class="btn-submit" id="confirm-ok" style="flex:1">${getLang() === "zh-CN" ? "确定" : "OK"}</button>
  </div>
</div>`;
    document.body.appendChild(overlay);
    const close = (val) => { overlay.remove(); resolve(val); };
    overlay.querySelector("#modal-close").addEventListener("click", () => close(false));
    overlay.querySelector("#confirm-cancel").addEventListener("click", () => close(false));
    overlay.querySelector("#confirm-ok").addEventListener("click", () => close(true));
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(false); });
  });
}

function esc(s) {
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function stringToColor(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  const colors = ["#6366f1","#8b5cf6","#ec4899","#14b8a6","#f59e0b","#3b82f6","#10b981","#ef4444"];
  return colors[Math.abs(hash) % colors.length];
}

function getProviderIcon(issuer) {
  const name = (issuer || "").toLowerCase();
  if (name.includes("google")) return `<svg width="20" height="20" viewBox="0 0 24 24"><path fill="#fff" d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z"/></svg>`;
  if (name.includes("okta")) return `<svg width="20" height="20" viewBox="0 0 24 24"><circle cx="12" cy="12" r="5" fill="#fff"/><path fill="#fff" d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm0 18c-3.314 0-6-2.686-6-6s2.686-6 6-6 6 2.686 6 6-2.686 6-6 6z"/></svg>`;
  if (name.includes("github")) return `<svg width="20" height="20" viewBox="0 0 24 24" fill="#fff"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg>`;
  if (name.includes("microsoft") || name.includes("azure")) return `<svg width="20" height="20" viewBox="0 0 24 24" fill="#fff"><path d="M11.4 24H0V12.6h11.4V24zM24 24H12.6V12.6H24V24zM11.4 11.4H0V0h11.4v11.4zm12.6 0H12.6V0H24v11.4z"/></svg>`;
  if (name.includes("duo")) return `<svg width="20" height="20" viewBox="0 0 24 24" fill="#fff"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H8V8h3c2.76 0 5 2.24 5 4s-2.24 4-5 4z"/></svg>`;
  return null;
}

// ── Passkey Views ───────────────────────────────────────────────────────────

function renderPasskeys(shell) {
  const content = shell.querySelector("#main-content");
  const passkeys = getPasskeys();

  content.innerHTML = `
<div class="nav-tabs">
  <button class="nav-btn" data-nav="otp">
    <svg width="14" height="14" viewBox="0 0 512 512"><defs><linearGradient id="oti" x1=".5" y1="0" x2=".5" y2="1"><stop offset="0%" stop-color="#34d399"/><stop offset="100%" stop-color="#059669"/></linearGradient></defs><path d="M256 80 L110 148 V280 C110 378 256 452 256 452 S402 378 402 280 V148 Z" fill="#10b981" fill-opacity=".10"/><path d="M256 80 L110 148 V280 C110 378 256 452 256 452 S402 378 402 280 V148 Z" fill="none" stroke="url(#oti)" stroke-width="12" stroke-linejoin="round"/><path d="M224 253 V230 A32 32 0 0 1 288 230 V253" fill="none" stroke="url(#oti)" stroke-width="14" stroke-linecap="round"/><rect x="202" y="253" width="108" height="82" rx="12" fill="url(#oti)"/><circle cx="256" cy="284" r="14" fill="var(--bg2)"/><path d="M248 292 L256 323 L264 292 Z" fill="var(--bg2)"/></svg>
    OTP
  </button>
  <button class="nav-btn active" data-nav="passkeys">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>
    Passkey
  </button>
</div>
<div class="toolbar">
  <div class="search-wrap" style="flex:1">
    <span style="font-size:13px;font-weight:600;color:var(--text)">Passkeys</span>
  </div>
  ${isPushSupported() ? `<button class="btn-export" id="btn-push-settings" title="${t("push.settings")}">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
    </svg>
  </button>` : ""}
  <button class="btn-add" id="btn-add-passkey" title="${t("passkey.add.btn")}">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
    </svg>
  </button>
</div>
<div class="accounts-list">
  ${passkeys.length === 0 ? `
  <div class="empty">
    <div class="empty-icon">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2">
        <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>
      </svg>
    </div>
    <p class="empty-title">${t("passkey.empty.title")}</p>
    <p class="empty-sub">${t("passkey.empty.sub")}</p>
  </div>` : passkeys.map(pk => `
  <div class="account-card passkey-card" data-pk-id="${pk.id}">
    <div class="card-left">
      <div class="avatar" style="background:#6366f1">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>
      </div>
      <div class="card-info">
        <span class="card-issuer">${esc(pk.rpName || pk.rpId)}</span>
        <span class="card-name">${esc(pk.userName)}</span>
      </div>
    </div>
    <div class="card-right">
      <span class="passkey-date">${new Date(pk.createdAt).toLocaleDateString()}</span>
      <div class="card-actions" style="opacity:1">
        <button class="btn-icon btn-pk-sign" title="${t("sign.verify")}" data-pk-id="${pk.id}">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M20 6L9 17l-5-5"/>
          </svg>
        </button>
        <button class="btn-icon btn-delete btn-pk-delete" title="${t("delete")}" data-pk-id="${pk.id}">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
            <path d="M10 11v6"/><path d="M14 11v6"/>
          </svg>
        </button>
      </div>
    </div>
  </div>`).join("")}
</div>`;

  content.querySelectorAll(".nav-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      if (btn.dataset.nav === "otp") { view = "home"; render(); }
    });
  });

  content.querySelector("#btn-push-settings")?.addEventListener("click", () => {
    view = "push-settings";
    render();
  });

  content.querySelector("#btn-add-passkey")?.addEventListener("click", () => {
    if (!hasMasterPassword()) {
      showSetMasterPasswordModal(() => { view = "add-passkey"; render(); });
    } else {
      view = "add-passkey";
      render();
    }
  });

  content.querySelectorAll(".btn-pk-delete").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (!await showConfirm(t("confirm.delete.passkey"))) return;
      deletePasskey(btn.dataset.pkId);
      render();
    });
  });

  content.querySelectorAll(".btn-pk-sign").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      showSignChallengeModal(btn.dataset.pkId);
    });
  });
}

function renderAddPasskey(shell) {
  const content = shell.querySelector("#main-content");

  content.innerHTML = `
<div class="form-header">
  <button class="btn-back" id="btn-back">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
      <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
    </svg>
  </button>
  <h2 class="form-title">${t("passkey.add.title")}</h2>
</div>
<div class="tab-content">
  <div class="form-group">
    <label>${t("label.rpid")}</label>
    <input type="text" id="pk-rpid" placeholder="example.com" />
  </div>
  <div class="form-group">
    <label>${t("label.rpname")}</label>
    <input type="text" id="pk-rpname" placeholder="Example Service" />
  </div>
  <div class="form-group">
    <label>${t("label.username")}</label>
    <input type="text" id="pk-user" placeholder="user@example.com" />
  </div>
  <div class="form-group">
    <label>${t("label.displayname")}</label>
    <input type="text" id="pk-displayname" placeholder="${t("displayname.placeholder")}" />
  </div>
  <button class="btn-submit" id="btn-create-passkey">${t("btn.create.passkey")}</button>
</div>`;

  content.querySelector("#btn-back")?.addEventListener("click", () => {
    view = "passkeys";
    render();
  });

  content.querySelector("#btn-create-passkey")?.addEventListener("click", async () => {
    const rpId = content.querySelector("#pk-rpid").value.trim();
    const rpName = content.querySelector("#pk-rpname").value.trim() || rpId;
    const userName = content.querySelector("#pk-user").value.trim();
    const userDisplayName = content.querySelector("#pk-displayname").value.trim() || userName;

    if (!rpId || !userName) {
      showAlert(t("alert.rpid.username.required"));
      return;
    }

    showUnlockModal(async (password) => {
      try {
        await createPasskey(password, { rpId, rpName, userName, userDisplayName });
        view = "passkeys";
        render();
      } catch (e) {
        showAlert(t("alert.create.failed") + e.message);
      }
    });
  });
}

function showSetMasterPasswordModal(onSuccess) {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
<div class="modal">
  <div class="modal-header">
    <span class="modal-title">${t("modal.set.master")}</span>
    <button class="modal-close" id="modal-close">✕</button>
  </div>
  <p style="font-size:12px;color:var(--text2)">${t("master.pw.hint")}</p>
  <div class="form-group">
    <label>${t("label.master.pw")}</label>
    <input type="password" id="mp-password" placeholder="${t("master.pw.placeholder")}" />
  </div>
  <div class="form-group">
    <label>${t("label.confirm.pw")}</label>
    <input type="password" id="mp-confirm" placeholder="${t("confirm.pw.placeholder")}" />
  </div>
  <span class="field-hint hint-err" id="mp-error" style="display:none"></span>
  <button class="btn-submit" id="mp-submit">${t("btn.set.pw")}</button>
</div>`;
  document.body.appendChild(overlay);

  overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });
  overlay.querySelector("#modal-close").addEventListener("click", () => overlay.remove());
  overlay.querySelector("#mp-submit").addEventListener("click", async () => {
    const pw = overlay.querySelector("#mp-password").value;
    const confirm = overlay.querySelector("#mp-confirm").value;
    const errEl = overlay.querySelector("#mp-error");
    if (pw.length < 4) {
      errEl.textContent = t("err.pw.min.length");
      errEl.style.display = "";
      return;
    }
    if (pw !== confirm) {
      errEl.textContent = t("err.pw.mismatch");
      errEl.style.display = "";
      return;
    }
    await setMasterPassword(pw);
    overlay.remove();
    if (onSuccess) onSuccess();
  });
}

function showUnlockModal(onUnlock) {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
<div class="modal">
  <div class="modal-header">
    <span class="modal-title">${t("modal.enter.master")}</span>
    <button class="modal-close" id="modal-close">✕</button>
  </div>
  <div class="form-group">
    <label>${t("label.master.pw")}</label>
    <input type="password" id="unlock-pw" placeholder="${t("master.pw.placeholder")}" />
  </div>
  <span class="field-hint hint-err" id="unlock-error" style="display:none"></span>
  <button class="btn-submit" id="unlock-submit">${t("btn.unlock")}</button>
</div>`;
  document.body.appendChild(overlay);

  overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });
  overlay.querySelector("#modal-close").addEventListener("click", () => overlay.remove());
  overlay.querySelector("#unlock-submit").addEventListener("click", async () => {
    const pw = overlay.querySelector("#unlock-pw").value;
    const errEl = overlay.querySelector("#unlock-error");
    const valid = await verifyMasterPassword(pw);
    if (!valid) {
      errEl.textContent = t("err.pw.wrong");
      errEl.style.display = "";
      return;
    }
    overlay.remove();
    if (onUnlock) onUnlock(pw);
  });
}

function showSignChallengeModal(passkeyId) {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
<div class="modal">
  <div class="modal-header">
    <span class="modal-title">${t("modal.sign.title")}</span>
    <button class="modal-close" id="modal-close">✕</button>
  </div>
  <div class="form-group">
    <label>${t("label.challenge")}</label>
    <textarea id="sign-challenge" rows="3" placeholder="${t("challenge.placeholder")}"></textarea>
  </div>
  <div class="form-group">
    <label>${t("label.master.pw")}</label>
    <input type="password" id="sign-pw" placeholder="${t("master.pw.placeholder")}" />
  </div>
  <span class="field-hint hint-err" id="sign-error" style="display:none"></span>
  <button class="btn-submit" id="sign-submit">${t("btn.sign")}</button>
  <div id="sign-result" style="display:none;margin-top:12px">
    <label>${t("label.sign.result")}</label>
    <textarea id="sign-output" rows="3" class="mono" readonly></textarea>
  </div>
</div>`;
  document.body.appendChild(overlay);

  overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });
  overlay.querySelector("#modal-close").addEventListener("click", () => overlay.remove());
  overlay.querySelector("#sign-submit").addEventListener("click", async () => {
    const challengeB64 = overlay.querySelector("#sign-challenge").value.trim();
    const pw = overlay.querySelector("#sign-pw").value;
    const errEl = overlay.querySelector("#sign-error");

    if (!challengeB64) { errEl.textContent = t("err.enter.challenge"); errEl.style.display = ""; return; }

    try {
      const challengeBytes = Uint8Array.from(atob(challengeB64), c => c.charCodeAt(0));
      const result = await signChallenge(pw, passkeyId, challengeBytes);
      overlay.querySelector("#sign-result").style.display = "";
      overlay.querySelector("#sign-output").value = result.signature;
    } catch (e) {
      errEl.textContent = e.message;
      errEl.style.display = "";
    }
  });
}

// ── Push Settings View ──────────────────────────────────────────────────────

async function renderPushSettings(shell) {
  const content = shell.querySelector("#main-content");
  const supported = isPushSupported();
  const permission = getPushPermission();
  const subscription = await getCurrentSubscription();
  const config = getPushConfig();

  content.innerHTML = `
<div class="form-header">
  <button class="btn-back" id="btn-back">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
      <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
    </svg>
  </button>
  <h2 class="form-title">${t("push.title")}</h2>
</div>
<div class="tab-content">
  <div class="push-status">
    <div class="push-status-row">
      <span class="push-label">${t("push.browser.support")}</span>
      <span class="push-value ${supported ? "hint-ok" : "hint-err"}">${supported ? t("push.supported") : t("push.not.supported")}</span>
    </div>
    <div class="push-status-row">
      <span class="push-label">${t("push.permission")}</span>
      <span class="push-value ${permission === "granted" ? "hint-ok" : permission === "denied" ? "hint-err" : ""}">${permission === "granted" ? t("push.granted") : permission === "denied" ? t("push.denied") : t("push.default")}</span>
    </div>
    <div class="push-status-row">
      <span class="push-label">${t("push.subscription")}</span>
      <span class="push-value ${subscription ? "hint-ok" : ""}">${subscription ? t("push.subscribed") : t("push.not.subscribed")}</span>
    </div>
  </div>

  ${!supported ? `<p class="field-hint hint-err" style="margin-top:12px">${t("push.not.supported.msg")}</p>` : `
  ${!subscription ? `
  <div class="form-group" style="margin-top:12px">
    <label>${t("push.vapid.label")}</label>
    <input type="text" id="push-vapid" placeholder="${t("push.vapid.placeholder")}" value="${esc(config.vapidKey || "")}" class="mono" />
    <span class="field-hint">${t("push.vapid.hint")}</span>
  </div>
  <button class="btn-submit" id="btn-subscribe">${t("push.enable")}</button>
  ` : `
  <div class="form-group" style="margin-top:12px">
    <label>${t("push.endpoint")}</label>
    <textarea rows="2" class="mono" readonly style="font-size:10px">${esc(subscription.endpoint)}</textarea>
  </div>
  <button class="btn-submit" id="btn-unsubscribe" style="background:var(--danger)">${t("push.unsubscribe")}</button>
  `}
  `}

  <div style="margin-top:20px;padding-top:16px;border-top:1px solid var(--border)">
    <p class="field-hint" style="margin-bottom:8px">${t("push.test.label")}</p>
    <button class="btn-scan" id="btn-test-push">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
      </svg>
      ${t("push.test.btn")}
    </button>
  </div>
</div>`;

  content.querySelector("#btn-back")?.addEventListener("click", () => {
    view = "passkeys";
    render();
  });

  content.querySelector("#btn-subscribe")?.addEventListener("click", async () => {
    const vapidKey = content.querySelector("#push-vapid")?.value.trim();
    if (!vapidKey) { showAlert(t("alert.enter.vapid")); return; }
    try {
      saveVapidKey(vapidKey);
      await subscribePush(vapidKey);
      render();
    } catch (e) {
      showAlert(t("alert.subscribe.failed") + e.message);
    }
  });

  content.querySelector("#btn-unsubscribe")?.addEventListener("click", async () => {
    try {
      await unsubscribePush();
      render();
    } catch (e) {
      showAlert(t("alert.unsubscribe.failed") + e.message);
    }
  });

  content.querySelector("#btn-test-push")?.addEventListener("click", () => {
    if (!("Notification" in window) || Notification.permission !== "granted") {
      showAlert(t("alert.grant.permission"));
      return;
    }
    new Notification(t("app.name"), {
      body: t("push.test.body"),
      icon: "/icons/icon-192.png",
    });
  });
}

function showPushApprovalModal(data) {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
<div class="modal">
  <div class="modal-header">
    <span class="modal-title">${t("push.auth.request")}</span>
    <button class="modal-close" id="modal-close">✕</button>
  </div>
  <div style="text-align:center;padding:16px 0">
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="1.5">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
    </svg>
    <p style="margin-top:12px;font-size:13px;font-weight:600">${esc(data.title || t("push.auth.request"))}</p>
    <p style="margin-top:4px;font-size:12px;color:var(--text2)">${esc(data.body || t("push.new.login"))}</p>
    ${data.source ? `<p style="margin-top:4px;font-size:11px;color:var(--text2)">${t("push.source")}${esc(data.source)}</p>` : ""}
    <p style="margin-top:4px;font-size:10px;color:var(--text2)">${new Date().toLocaleTimeString()}</p>
  </div>
  <div style="display:flex;gap:8px">
    <button class="btn-submit" id="btn-deny" style="flex:1;background:var(--danger)">${t("push.deny")}</button>
    <button class="btn-submit" id="btn-approve" style="flex:1">${t("push.approve")}</button>
  </div>
</div>`;
  document.body.appendChild(overlay);

  overlay.querySelector("#modal-close").addEventListener("click", () => overlay.remove());

  overlay.querySelector("#btn-approve").addEventListener("click", async () => {
    if (data.responseUrl && data.requestId) {
      try { await respondToPush(data.responseUrl, data.requestId, "approve"); } catch {}
    }
    overlay.remove();
  });

  overlay.querySelector("#btn-deny").addEventListener("click", async () => {
    if (data.responseUrl && data.requestId) {
      try { await respondToPush(data.responseUrl, data.requestId, "deny"); } catch {}
    }
    overlay.remove();
  });
}

// ── CSS ────────────────────────────────────────────────────────────────────
const css = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg: #0d1117;
    --bg2: #161b22;
    --bg3: #21262d;
    --border: rgba(255,255,255,0.07);
    --text: #e6edf3;
    --text2: #7d8590;
    --accent: #10b981;
    --accent2: #059669;
    --danger: #ef4444;
    --radius: 12px;
    --font-mono: 'JetBrains Mono', monospace;
    --font: 'Inter', system-ui, sans-serif;
    --timer-ok: #10b981;
    --timer-warn: #f59e0b;
    --timer-danger: #ef4444;
    --ring-bg: rgba(255,255,255,0.08);
    --ring-text: rgba(255,255,255,0.5);
    --qr-dark: #e6edf3;
    --qr-light: #161b22;
    --shadow: rgba(0,0,0,0.6);
    --badge-hotp-bg: rgba(245,158,11,0.2);
    --badge-hotp-text: #f59e0b;
    --card-hover-border: rgba(16,185,129,0.3);
    --copy-hover-bg: rgba(16,185,129,0.1);
    --modal-overlay: rgba(0,0,0,0.75);
  }

  [data-theme="light"] {
    --bg: #ffffff;
    --bg2: #f6f8fa;
    --bg3: #e8ebef;
    --border: rgba(0,0,0,0.1);
    --text: #1f2328;
    --text2: #656d76;
    --accent: #059669;
    --accent2: #047857;
    --danger: #dc2626;
    --timer-ok: #059669;
    --timer-warn: #d97706;
    --timer-danger: #dc2626;
    --ring-bg: rgba(0,0,0,0.1);
    --ring-text: rgba(0,0,0,0.4);
    --qr-dark: #1f2328;
    --qr-light: #ffffff;
    --shadow: rgba(0,0,0,0.12);
    --badge-hotp-bg: rgba(217,119,6,0.15);
    --badge-hotp-text: #b45309;
    --card-hover-border: rgba(5,150,105,0.3);
    --copy-hover-bg: rgba(5,150,105,0.1);
    --modal-overlay: rgba(0,0,0,0.5);
  }

  html, body {
    width: 100%; height: 100%;
    background: transparent;
    color: var(--text);
    font-family: var(--font);
    font-size: 13px;
    -webkit-font-smoothing: antialiased;
    user-select: none;
    overflow: hidden;
  }

  #app { width: 100%; height: 100vh; }

  .shell {
    display: flex; flex-direction: column;
    width: 100%; height: 100vh;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 32px 80px var(--shadow);
  }

  /* Titlebar */
  .titlebar {
    display: flex; align-items: center; justify-content: space-between;
    height: 40px; padding: 0 12px;
    background: var(--bg2);
    border-bottom: 1px solid var(--border);
    cursor: default;
    flex-shrink: 0;
  }
  .titlebar-title {
    display: flex; align-items: center; gap: 7px;
    font-size: 12px; font-weight: 600;
    color: var(--text2);
    letter-spacing: 0.02em;
  }
  .titlebar-actions { display: flex; gap: 2px; margin-left: auto; margin-right: 8px; }
  .titlebar-actions .tb-btn { font-size: 10px; font-weight: 700; letter-spacing: 0.03em; }
  .titlebar-controls { display: flex; gap: 4px; }
  .tb-btn {
    width: 28px; height: 22px;
    background: transparent; border: none;
    color: var(--text2); cursor: pointer;
    border-radius: 5px; font-size: 11px;
    display: flex; align-items: center; justify-content: center;
    transition: background 0.15s, color 0.15s;
  }
  .tb-btn:hover { background: var(--bg3); color: var(--text); }
  .tb-btn.close:hover { background: var(--danger); color: #fff; }

  /* Content */
  .content {
    flex: 1; overflow-y: auto; overflow-x: hidden;
    padding: 12px;
    scrollbar-width: thin;
    scrollbar-color: var(--bg3) transparent;
  }

  /* Toolbar */
  .toolbar {
    display: flex; align-items: center; gap: 8px;
    margin-bottom: 12px;
  }
  .search-wrap {
    flex: 1; position: relative;
    display: flex; align-items: center;
  }
  .search-icon {
    position: absolute; left: 10px;
    color: var(--text2); pointer-events: none;
  }
  .search {
    width: 100%; padding: 8px 10px 8px 32px;
    background: var(--bg2); border: 1px solid var(--border);
    border-radius: 8px; color: var(--text);
    font-size: 12px; outline: none;
    transition: border-color 0.2s;
    font-family: var(--font);
  }
  .search:focus { border-color: var(--accent); }
  .btn-add {
    width: 36px; height: 36px;
    background: var(--accent); border: none;
    border-radius: 8px; color: #fff;
    cursor: pointer; display: flex; align-items: center; justify-content: center;
    transition: background 0.15s, transform 0.1s;
    flex-shrink: 0;
  }
  .btn-add:hover { background: var(--accent2); transform: scale(1.05); }
  .btn-add:active { transform: scale(0.95); }

  .btn-export {
    width: 36px; height: 36px;
    background: var(--bg2); border: 1px solid var(--border);
    border-radius: 8px; color: var(--text2);
    cursor: pointer; display: flex; align-items: center; justify-content: center;
    transition: all 0.15s;
    flex-shrink: 0;
  }
  .btn-export:hover { border-color: var(--accent); color: var(--accent); }

  .migration-pager {
    display: flex; align-items: center; justify-content: center;
    gap: 16px; margin-top: 12px;
  }
  .btn-page {
    width: 32px; height: 32px; border-radius: 8px;
    background: var(--bg3); border: 1px solid var(--border);
    color: var(--text); cursor: pointer; font-size: 16px;
    display: flex; align-items: center; justify-content: center;
    transition: all 0.15s;
  }
  .btn-page:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
  .btn-page:disabled { opacity: 0.3; cursor: not-allowed; }
  .page-info { font-size: 12px; color: var(--text2); font-weight: 600; }

  /* HOTP */
  .btn-hotp-refresh {
    width: 36px; height: 36px; border-radius: 8px;
    background: var(--bg3); border: 1px solid var(--border);
    color: var(--text2); cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    transition: all 0.2s; flex-shrink: 0;
  }
  .btn-hotp-refresh:hover { border-color: var(--accent); color: var(--accent); transform: rotate(90deg); }
  .btn-hotp-refresh:active { transform: rotate(180deg); }

  .type-badge {
    font-size: 9px; font-weight: 700; letter-spacing: 0.05em;
    padding: 1px 5px; border-radius: 4px;
    margin-left: 6px; vertical-align: middle;
  }
  .type-badge.hotp { background: var(--badge-hotp-bg); color: var(--badge-hotp-text); }

  .type-toggle {
    display: flex; gap: 4px;
    background: var(--bg2); border: 1px solid var(--border);
    border-radius: 8px; padding: 3px;
  }
  .type-btn {
    flex: 1; padding: 6px;
    background: transparent; border: none;
    color: var(--text2); cursor: pointer;
    border-radius: 6px; font-size: 12px; font-weight: 500;
    transition: all 0.15s; font-family: var(--font);
  }
  .type-btn.active { background: var(--bg3); color: var(--text); }

  /* Nav tabs */
  .nav-tabs {
    display: flex; gap: 4px;
    background: var(--bg2); border: 1px solid var(--border);
    border-radius: 8px; padding: 3px;
    margin-bottom: 10px;
  }
  .nav-btn {
    flex: 1; padding: 7px;
    background: transparent; border: none;
    color: var(--text2); cursor: pointer;
    border-radius: 6px; font-size: 12px; font-weight: 500;
    display: flex; align-items: center; justify-content: center; gap: 6px;
    transition: all 0.15s; font-family: var(--font);
  }
  .nav-btn.active { background: var(--bg3); color: var(--text); }
  .nav-btn:hover:not(.active) { color: var(--text); }

  /* Passkey cards */
  .passkey-date { font-size: 10px; color: var(--text2); white-space: nowrap; }

  /* Push settings */
  .push-status {
    display: flex; flex-direction: column; gap: 8px;
    background: var(--bg2); border: 1px solid var(--border);
    border-radius: var(--radius); padding: 12px;
  }
  .push-status-row {
    display: flex; justify-content: space-between; align-items: center;
    font-size: 12px;
  }
  .push-label { color: var(--text2); }
  .push-value { color: var(--text); font-weight: 500; }

  /* Account Cards */
  .accounts-list { display: flex; flex-direction: column; gap: 8px; }

  .account-card {
    display: flex; align-items: center; justify-content: space-between;
    background: var(--bg2); border: 1px solid var(--border);
    border-radius: var(--radius); padding: 12px 14px;
    transition: border-color 0.2s, background 0.2s;
    cursor: pointer;
  }
  .account-card:hover { border-color: var(--card-hover-border); background: var(--bg3); }

  .card-left { display: flex; align-items: center; gap: 12px; min-width: 0; }
  .avatar {
    width: 38px; height: 38px; border-radius: 10px;
    display: flex; align-items: center; justify-content: center;
    font-size: 12px; font-weight: 700; color: #fff;
    flex-shrink: 0; letter-spacing: 0.05em;
  }
  .card-info { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .card-issuer {
    font-size: 12px; font-weight: 600; color: var(--text);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .card-name {
    font-size: 11px; color: var(--text2);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }

  .card-right {
    display: flex; align-items: center; gap: 10px;
    flex-shrink: 0;
  }

  .timer-ring { flex-shrink: 0; }

  .btn-copy {
    font-family: var(--font-mono); font-size: 17px; font-weight: 700;
    color: var(--accent); background: transparent;
    border: none; cursor: pointer; letter-spacing: 2px;
    padding: 4px 6px; border-radius: 6px;
    transition: background 0.15s, color 0.15s;
    white-space: nowrap;
  }
  .btn-copy:hover { background: var(--copy-hover-bg); }
  .btn-copy.copied { color: #fff; background: var(--accent); }
  .btn-copy.urgent { color: var(--danger); animation: pulse 0.5s ease infinite alternate; }

  @keyframes pulse { from { opacity: 1; } to { opacity: 0.5; } }

  .card-actions {
    display: flex; flex-direction: column; gap: 3px;
    opacity: 0; transition: opacity 0.2s;
  }
  .account-card:hover .card-actions { opacity: 1; }

  .btn-icon {
    width: 24px; height: 24px; border-radius: 5px;
    background: transparent; border: 1px solid var(--border);
    color: var(--text2); cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    transition: all 0.15s;
  }
  .btn-icon:hover { color: var(--text); background: var(--bg3); }
  .btn-delete:hover { color: var(--danger); border-color: var(--danger); }

  /* Empty state */
  .empty {
    display: flex; flex-direction: column; align-items: center;
    justify-content: center; padding: 60px 20px; gap: 12px;
    text-align: center;
  }
  .empty-icon { color: var(--text2); opacity: 0.4; }
  .empty-title { font-size: 14px; font-weight: 600; color: var(--text2); }
  .empty-sub { font-size: 12px; color: var(--text2); opacity: 0.7; }

  /* Form */
  .form-header {
    display: flex; align-items: center; gap: 10px;
    margin-bottom: 16px;
  }
  .btn-back {
    width: 32px; height: 32px; border-radius: 8px;
    background: var(--bg2); border: 1px solid var(--border);
    color: var(--text2); cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    transition: all 0.15s;
  }
  .btn-back:hover { color: var(--text); border-color: var(--accent); }
  .form-title { font-size: 15px; font-weight: 600; }

  .form-tabs {
    display: flex; gap: 4px;
    background: var(--bg2); border: 1px solid var(--border);
    border-radius: 8px; padding: 3px;
    margin-bottom: 14px;
  }
  .tab-btn {
    flex: 1; padding: 6px;
    background: transparent; border: none;
    color: var(--text2); cursor: pointer;
    border-radius: 6px; font-size: 12px; font-weight: 500;
    transition: all 0.15s; font-family: var(--font);
  }
  .tab-btn.active { background: var(--bg3); color: var(--text); }

  .tab-content { display: flex; flex-direction: column; gap: 12px; }
  .tab-content.hidden { display: none; }

  .form-group { display: flex; flex-direction: column; gap: 5px; }
  .form-row { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; }

  label { font-size: 11px; font-weight: 600; color: var(--text2); letter-spacing: 0.05em; text-transform: uppercase; }

  input[type=text], input[type=number], input[type=password], textarea, select {
    padding: 9px 11px;
    background: var(--bg2); border: 1px solid var(--border);
    border-radius: 8px; color: var(--text);
    font-size: 12px; outline: none;
    font-family: var(--font);
    transition: border-color 0.2s;
    width: 100%;
  }
  input:focus, textarea:focus, select:focus { border-color: var(--accent); }
  textarea { resize: vertical; min-height: 80px; }
  select { cursor: pointer; }
  .mono { font-family: var(--font-mono); letter-spacing: 0.08em; }

  /* Issuer combo */
  .issuer-combo { display: flex; flex-direction: column; gap: 6px; }
  .issuer-chips { display: flex; flex-wrap: wrap; gap: 5px; }
  .issuer-chip {
    padding: 4px 10px; border-radius: 6px;
    background: var(--bg3); border: 1px solid var(--border);
    color: var(--text2); cursor: pointer;
    font-size: 11px; font-weight: 500; font-family: var(--font);
    transition: all 0.15s;
  }
  .issuer-chip:hover { border-color: var(--accent); color: var(--text); }
  .issuer-chip.active { background: var(--accent); border-color: var(--accent); color: #fff; }

  .secret-wrap { position: relative; display: flex; }
  .secret-wrap input { padding-right: 38px; }
  .btn-gen {
    position: absolute; right: 8px; top: 50%; transform: translateY(-50%);
    width: 24px; height: 24px; border-radius: 5px;
    background: transparent; border: none;
    color: var(--text2); cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    transition: color 0.15s;
  }
  .btn-gen:hover { color: var(--accent); }

  .field-hint { font-size: 10px; color: var(--text2); }
  .hint-ok { color: var(--accent); }
  .hint-err { color: var(--danger); }

  .btn-submit {
    width: 100%; padding: 11px;
    background: var(--accent); border: none;
    border-radius: 8px; color: #fff;
    font-size: 13px; font-weight: 600;
    cursor: pointer; transition: background 0.15s, transform 0.1s;
    font-family: var(--font);
    margin-top: 4px;
  }
  .btn-submit:hover { background: var(--accent2); }
  .btn-submit:active { transform: scale(0.98); }

  /* Modal */
  .modal-overlay {
    position: fixed; inset: 0; z-index: 1000;
    background: var(--modal-overlay);
    display: flex; align-items: center; justify-content: center;
    animation: fadeIn 0.15s ease;
  }
  .modal {
    background: var(--bg2); border-radius: 16px;
    padding: 20px; max-width: 340px; width: 90%;
    border: 1px solid var(--border);
    position: relative;
    display: flex; flex-direction: column; gap: 12px;
  }
  .modal-header {
    display: flex; align-items: center; justify-content: space-between;
  }
  .modal-title { font-size: 14px; font-weight: 600; }
  .modal-close {
    width: 26px; height: 26px; border-radius: 6px;
    background: transparent; border: 1px solid var(--border);
    color: var(--text2); cursor: pointer; font-size: 12px;
    display: flex; align-items: center; justify-content: center;
    transition: all 0.15s;
  }
  .modal-close:hover { color: var(--text); border-color: var(--danger); color: var(--danger); }
  .modal-hint {
    font-size: 11px; color: var(--text2); text-align: center;
    margin-top: 10px;
  }
  #qr-reader { width: 100%; border-radius: 8px; overflow: hidden; }
  .qr-image { display: block; margin: 0 auto; border-radius: 8px; width: 256px; height: 256px; }
  .qr-info {
    display: flex; flex-direction: column; align-items: center;
    gap: 2px; margin-top: 12px;
  }
  .qr-issuer { font-size: 13px; font-weight: 600; }
  .qr-name { font-size: 11px; color: var(--text2); }
  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

  /* Scan button */
  .btn-scan {
    width: 100%; padding: 11px;
    background: var(--bg3); border: 1px solid var(--border);
    border-radius: 8px; color: var(--text);
    font-size: 13px; font-weight: 500;
    cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px;
    transition: background 0.15s, border-color 0.15s;
    font-family: var(--font);
  }
  .btn-scan:hover { background: var(--bg2); border-color: var(--accent); color: var(--accent); }

  .scan-divider {
    display: flex; align-items: center; gap: 12px;
    margin: 12px 0; color: var(--text2); font-size: 11px;
  }
  .scan-divider::before, .scan-divider::after {
    content: ""; flex: 1; height: 1px; background: var(--border);
  }

  /* Non-desktop header */
  .app-header {
    display: flex; align-items: center;
    height: 40px; padding: 0 12px;
    background: var(--bg2);
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }
  .app-header .titlebar-actions { margin-left: auto; }

  /* Spinner */
  .spinner {
    width: 32px; height: 32px;
    border: 3px solid var(--border);
    border-top-color: var(--accent);
    border-radius: 50%;
    margin: 0 auto;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* Mobile responsive */
  @media (max-width: 480px) {
    .shell { border-radius: 0; box-shadow: none; border: none; }
    .card-actions { opacity: 1; }
  }

  /* SW update toast */
  .sw-update-toast {
    position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
    display: flex; align-items: center; gap: 12px;
    padding: 10px 18px; border-radius: 12px; z-index: 99999;
    background: var(--card-bg, #161b22); color: var(--text, #e6edf3);
    border: 1px solid var(--border, #30363d);
    box-shadow: 0 4px 24px rgba(0,0,0,.4);
    font-size: 14px; animation: sw-toast-in .3s ease;
  }
  .sw-update-toast button {
    background: var(--accent, #58a6ff); color: #fff; border: none;
    padding: 4px 14px; border-radius: 6px; cursor: pointer; font-size: 13px;
  }
  @keyframes sw-toast-in {
    from { opacity: 0; transform: translateX(-50%) translateY(16px); }
    to   { opacity: 1; transform: translateX(-50%) translateY(0); }
  }
`;

const styleEl = document.createElement("style");
styleEl.textContent = css;
document.head.appendChild(styleEl);

// ── Boot ───────────────────────────────────────────────────────────────────
(async () => {
  initTheme();
  initLang();
  document.title = t("app.name");
  await initStore();
  render();

  // Listen for push notification actions from Service Worker
  onPushAction((msg) => {
    if (msg.action === "approve" || msg.action === "deny") {
      // Auto-respond if action button was clicked in notification
      if (msg.data?.responseUrl && msg.data?.requestId) {
        respondToPush(msg.data.responseUrl, msg.data.requestId, msg.action).catch(() => {});
      }
    } else {
      // Notification body clicked — show approval modal
      showPushApprovalModal(msg.data || {});
    }
  });
})();
