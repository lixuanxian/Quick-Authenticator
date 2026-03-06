// ── QR Code Scanner & Generator ──────────────────────────────────────────────

import { Html5Qrcode } from "html5-qrcode";
import QRCode from "qrcode";
import { isOktaVerifyUri } from "./okta-activate.js";
import { isDuoUri } from "./duo-activate.js";
import { isGoogleMigrationUri, buildGoogleMigrationUris } from "./google-migrate.js";
import { cssVar } from "./i18n.js";

let scanner = null;

export async function startScanner(containerId, { onSuccess, onOkta, onDuo, onGoogleMigration, onUnsupported }) {
  scanner = new Html5Qrcode(containerId);
  let handled = false;
  await scanner.start(
    { facingMode: "environment" },
    { fps: 10, qrbox: { width: 220, height: 220 } },
    (text) => {
      if (handled) return;
      handled = true;
      stopScanner();
      if (text.startsWith("otpauth://") && !isOktaVerifyUri(text)) {
        onSuccess(text);
      } else if (isOktaVerifyUri(text)) {
        if (onOkta) onOkta(text);
      } else if (isDuoUri(text)) {
        if (onDuo) onDuo(text);
      } else if (isGoogleMigrationUri(text)) {
        if (onGoogleMigration) onGoogleMigration(text);
      } else {
        if (onUnsupported) onUnsupported(text);
      }
    },
    () => {} // ignore scan failures
  );
}

export async function stopScanner() {
  if (scanner) {
    try { await scanner.stop(); } catch {}
    scanner = null;
  }
}

export async function scanFromImage(file) {
  const tempDiv = document.createElement("div");
  tempDiv.id = "__qr_scan_temp__";
  tempDiv.style.display = "none";
  document.body.appendChild(tempDiv);
  const qr = new Html5Qrcode("__qr_scan_temp__");
  try {
    return await qr.scanFile(file, false);
  } finally {
    try { await qr.clear(); } catch {}
    tempDiv.remove();
  }
}

export async function scanFromScreen() {
  const stream = await navigator.mediaDevices.getDisplayMedia({ video: { cursor: "never" } });
  const track = stream.getVideoTracks()[0];
  const video = document.createElement("video");
  video.srcObject = stream;
  video.muted = true;
  await video.play();
  // Wait for a frame to be available
  await new Promise(r => setTimeout(r, 300));
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext("2d").drawImage(video, 0, 0);
  track.stop();
  const blob = await new Promise(r => canvas.toBlob(r, "image/png"));
  const file = new File([blob], "screen.png", { type: "image/png" });
  return scanFromImage(file);
}

export async function generateMigrationQrDataUrls(accounts, batchSize = 10) {
  const uris = buildGoogleMigrationUris(accounts, batchSize);
  const urls = [];
  for (const uri of uris) {
    const dataUrl = await QRCode.toDataURL(uri, {
      width: 256,
      margin: 2,
      color: { dark: cssVar("--qr-dark") || "#e6edf3", light: cssVar("--qr-light") || "#161b22" },
      errorCorrectionLevel: "L",
    });
    urls.push(dataUrl);
  }
  return urls;
}

export async function generateQrDataUrl(account) {
  const isHotp = account.account_type === "hotp";
  const type = isHotp ? "hotp" : "totp";
  const params = new URLSearchParams({
    secret: account.secret,
    issuer: account.issuer || "",
    algorithm: account.algorithm || "SHA1",
    digits: String(account.digits || 6),
  });
  if (isHotp) {
    params.set("counter", String(account.counter || 0));
  } else {
    params.set("period", String(account.period || 30));
  }
  const label = account.issuer
    ? `${encodeURIComponent(account.issuer)}:${encodeURIComponent(account.name)}`
    : encodeURIComponent(account.name);
  const uri = `otpauth://${type}/${label}?${params}`;
  return QRCode.toDataURL(uri, {
    width: 256,
    margin: 2,
    color: { dark: cssVar("--qr-dark") || "#e6edf3", light: cssVar("--qr-light") || "#161b22" },
  });
}
