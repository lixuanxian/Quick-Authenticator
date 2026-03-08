// ── QR Code Scanner & Generator ──────────────────────────────────────────────
// Scanning: jsQR (primary, with preprocessing) + html5-qrcode (camera + fallback)
// Generation: qrcode — toDataURL

import { Html5Qrcode } from "html5-qrcode";
import QRCode from "qrcode";
import jsQR from "jsqr";
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
    { fps: 15, qrbox: { width: 280, height: 280 }, aspectRatio: 1.0 },
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

/**
 * Load a File/Blob into a canvas at an optional max dimension.
 */
async function fileToCanvas(file, maxDim = 0) {
  const bmp = await createImageBitmap(file);
  let w = bmp.width, h = bmp.height;
  if (maxDim && Math.max(w, h) > maxDim) {
    const scale = maxDim / Math.max(w, h);
    w = Math.round(w * scale);
    h = Math.round(h * scale);
  }
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  return { canvas, ctx, w, h };
}

/**
 * Try decoding QR with jsQR on raw ImageData.
 * Applies contrast enhancement and binarization for dense/low-quality codes.
 */
function tryJsQR(imageData, w, h) {
  const data = imageData.data;

  // Attempt 1: original image
  const r1 = jsQR(data, w, h, { inversionAttempts: "attemptBoth" });
  if (r1) return r1.data;

  // Attempt 2: enhanced contrast (stretch histogram)
  const enhanced = new Uint8ClampedArray(data);
  let min = 255, max = 0;
  for (let i = 0; i < enhanced.length; i += 4) {
    const gray = enhanced[i] * 0.299 + enhanced[i + 1] * 0.587 + enhanced[i + 2] * 0.114;
    if (gray < min) min = gray;
    if (gray > max) max = gray;
  }
  const range = max - min || 1;
  for (let i = 0; i < enhanced.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      enhanced[i + c] = Math.round(((enhanced[i + c] - min) / range) * 255);
    }
  }
  const r2 = jsQR(enhanced, w, h, { inversionAttempts: "attemptBoth" });
  if (r2) return r2.data;

  // Attempt 3: binarize (hard threshold at midpoint)
  const binarized = new Uint8ClampedArray(data);
  const mid = (min + max) / 2;
  for (let i = 0; i < binarized.length; i += 4) {
    const gray = binarized[i] * 0.299 + binarized[i + 1] * 0.587 + binarized[i + 2] * 0.114;
    const v = gray > mid ? 255 : 0;
    binarized[i] = binarized[i + 1] = binarized[i + 2] = v;
  }
  const r3 = jsQR(binarized, w, h, { inversionAttempts: "attemptBoth" });
  if (r3) return r3.data;

  return null;
}

export async function scanFromImage(file) {
  // Strategy: try jsQR at multiple resolutions, then fall back to html5-qrcode.
  const scales = [0, 1200, 800, 1600]; // 0 = original size
  for (const maxDim of scales) {
    try {
      const { ctx, w, h } = await fileToCanvas(file, maxDim);
      const imageData = ctx.getImageData(0, 0, w, h);
      const result = tryJsQR(imageData, w, h);
      if (result) return result;
    } catch {}
  }

  // Fallback: html5-qrcode (ZXing)
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
  await new Promise(r => setTimeout(r, 300));
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(video, 0, 0);
  track.stop();

  // Try jsQR directly on the captured frame first (faster than re-encoding to file)
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const result = tryJsQR(imageData, canvas.width, canvas.height);
  if (result) return result;

  // Fallback: encode to file and run full scanFromImage pipeline
  const blob = await new Promise(r => canvas.toBlob(r, "image/png"));
  const file = new File([blob], "screen.png", { type: "image/png" });
  return scanFromImage(file);
}

export async function generateMigrationQrDataUrls(accounts, batchSize = 5) {
  const uris = buildGoogleMigrationUris(accounts, batchSize);
  const urls = [];
  for (const uri of uris) {
    const dataUrl = await QRCode.toDataURL(uri, {
      width: 360,
      margin: 3,
      color: { dark: cssVar("--qr-dark") || "#e6edf3", light: cssVar("--qr-light") || "#161b22" },
      errorCorrectionLevel: "M",
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
