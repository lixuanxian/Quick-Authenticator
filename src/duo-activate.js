// ── Duo Mobile Activation ───────────────────────────────────────────────────
// Handles duo:// QR codes by calling Duo's activation API to retrieve
// the TOTP/HOTP shared secret, enabling use with any standard authenticator.
//
// Duo activation flow:
// 1. User scans QR code containing duo:// URI or HTTPS activation link
// 2. Parse activation code from URI
// 3. Call Duo activation endpoint to register device
// 4. Extract HOTP secret from response
// 5. Store as standard HOTP account

import { t } from "./i18n.js";

/**
 * Check if a scanned QR text is a Duo Mobile activation URI.
 */
export function isDuoUri(text) {
  return text.startsWith("duo://") || text.startsWith("duo-callback://");
}

/**
 * Parse a duo:// URI to extract the activation code and host.
 * Formats:
 *   duo://<activation_code>
 *   duo-callback://<activation_code>
 *   https://<api-host>/duo-callback/<activation_code>
 */
export function parseDuoUri(uri) {
  let code, host;

  if (uri.startsWith("duo://")) {
    code = uri.slice("duo://".length).split("?")[0].split("/")[0];
  } else if (uri.startsWith("duo-callback://")) {
    code = uri.slice("duo-callback://".length).split("?")[0].split("/")[0];
  } else {
    throw new Error(t("err.duo.invalid"));
  }

  if (!code) {
    throw new Error(t("err.duo.empty"));
  }

  // Try to extract host from query params
  try {
    const fakeUrl = uri.replace(/^duo(-callback)?:\/\//, "https://duo/");
    const url = new URL(fakeUrl);
    host = url.searchParams.get("host") || null;
  } catch {
    // no query params, that's fine
  }

  return { code, host };
}

/**
 * Activate a Duo Mobile device using the activation code.
 * Returns a standard account object ready to use.
 *
 * The activation API endpoint:
 *   POST https://<api-host>/push/v2/activation/<activation_code>
 *
 * Returns HOTP parameters including the secret key.
 */
export async function activateDuo({ code, host }) {
  const apiHost = host || "api-d4c83c50.duosecurity.com";
  const activationUrl = `https://${apiHost}/push/v2/activation/${code}`;

  // Build form data matching Duo Mobile's activation request
  const params = new URLSearchParams({
    pkpush: "rsa-sha512",
    pubkey: "-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA0" +
      "placeholder_key_for_activation\n-----END PUBLIC KEY-----",
    jailbroken: "false",
    architecture: "arm64",
    region: "US",
    app_id: "com.duosecurity.duomobile",
    full_disk_encryption: "true",
    passcode_status: "true",
    platform: "Android",
    app_version: "3.49.0",
    app_build_number: "323001",
    version: "11",
    manufacturer: "unknown",
    language: "en",
    model: "unknown",
    security_patch_level: "2021-02-01",
  });

  const resp = await fetch("/api/duo-activate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      targetUrl: activationUrl,
      payload: params.toString(),
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    if (resp.status === 404) {
      throw new Error(t("err.duo.expired"));
    }
    if (resp.status === 502) {
      throw new Error(t("err.duo.network"));
    }
    throw new Error(t("err.duo.api", resp.status, errText.slice(0, 200)));
  }

  const data = await resp.json();

  // Duo returns the HOTP secret in the response
  const hotpSecret = data.hotp_secret || data.response?.hotp_secret;
  if (!hotpSecret) {
    throw new Error(t("err.duo.no.secret"));
  }

  return {
    id: crypto.randomUUID(),
    name: data.customer_name || "Duo Mobile",
    issuer: "Duo",
    secret: hotpSecret.toUpperCase().replace(/\s/g, ""),
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    account_type: "hotp",
    counter: 0,
    icon: null,
  };
}
