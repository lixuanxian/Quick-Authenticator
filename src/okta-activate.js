// ── Okta Verify Activation ───────────────────────────────────────────────────
// Handles oktaverify:// QR codes by calling Okta's enrollment API to retrieve
// the TOTP shared secret, enabling use with any standard TOTP authenticator.

import { t } from "./i18n.js";

/**
 * Parse an oktaverify:// URI from QR code.
 * Format: oktaverify://user@example.com/?t=TOKEN&f=AUTH_ID&s=https://org.okta.com&issuer=org.okta.com
 */
export function parseOktaVerifyUri(uri) {
  // Handle both oktaverify:// and otpauth:// with Okta params (no secret)
  let url;
  try {
    // Replace oktaverify:// with https:// so URL parser works
    const normalized = uri.replace(/^oktaverify:\/\//, "https://");
    url = new URL(normalized);
  } catch {
    throw new Error(t("err.okta.parse"));
  }

  const token = url.searchParams.get("t");
  const authenticatorId = url.searchParams.get("f");
  const server = url.searchParams.get("s");

  if (!token || !server) {
    throw new Error(t("err.okta.missing.params"));
  }

  // Extract account name from the path/host
  const account = decodeURIComponent(url.pathname.replace(/^\/+/, "") || url.hostname || "");
  const issuer = url.searchParams.get("issuer") || new URL(server).hostname;

  return { token, authenticatorId, server, account, issuer };
}

/**
 * Check if a scanned QR text looks like an Okta Verify enrollment code.
 */
export function isOktaVerifyUri(text) {
  if (text.startsWith("oktaverify://")) return true;
  // Some classic Okta QR codes use otpauth:// but include t= and s= params without secret=
  if (text.startsWith("otpauth://") && /[?&]t=/.test(text) && /[?&]s=/.test(text) && !/[?&]secret=/.test(text)) {
    return true;
  }
  return false;
}

/**
 * Generate an RSA key pair and export the public key as JWK for the Okta API.
 */
async function generateDeviceKey() {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"]
  );

  const publicJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
  return {
    alg: "RS256",
    e: publicJwk.e,
    kty: "RSA",
    use: "sig",
    kid: crypto.randomUUID(),
    n: publicJwk.n,
    "okta:isFipsCompliant": false,
    "okta:kpr": "SOFTWARE",
  };
}

/**
 * Call Okta's activation API to register and retrieve the TOTP shared secret.
 * Returns a standard account object ready to use.
 */
export async function activateOktaVerify({ token, authenticatorId, server, account, issuer }) {
  const clientInstanceKey = await generateDeviceKey();

  const body = {
    authenticatorId,
    device: {
      clientInstanceBundleId: "com.okta.android.auth",
      clientInstanceDeviceSdkVersion: "DeviceSDK 0.19.0",
      clientInstanceVersion: "6.8.1",
      clientInstanceKey,
      deviceAttestation: {},
      displayName: t("app.name"),
      fullDiskEncryption: false,
      isHardwareProtectionEnabled: false,
      manufacturer: "unknown",
      model: "unknown",
      osVersion: "14",
      platform: "ANDROID",
      rootPrivileges: false,
      screenLock: true,
      secureHardwarePresent: false,
    },
    key: "okta_verify",
    methods: [
      {
        isFipsCompliant: false,
        supportUserVerification: false,
        type: "totp",
      },
    ],
  };

  const apiUrl = `${server.replace(/\/+$/, "")}/idp/authenticators`;

  // Use server-side proxy to bypass CORS restrictions
  const resp = await fetch("/api/okta-activate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      targetUrl: apiUrl,
      authorization: `OTDT ${token}`,
      payload: body,
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    if (resp.status === 401) {
      throw new Error(t("err.okta.expired"));
    }
    if (resp.status === 403) {
      throw new Error(t("err.okta.rejected"));
    }
    if (resp.status === 502) {
      throw new Error(t("err.okta.network"));
    }
    throw new Error(t("err.okta.api", resp.status, errText.slice(0, 200)));
  }

  const data = await resp.json();

  // Extract shared secret from response
  const totpMethod = (data.methods || []).find((m) => m.type === "totp");
  const sharedSecret = totpMethod?.sharedSecret;

  if (!sharedSecret) {
    // Fallback: check _embedded.activation for Classic Engine format
    const embedded = data._embedded?.activation?.sharedSecret;
    if (embedded) {
      return {
        id: crypto.randomUUID(),
        name: account || issuer,
        issuer: issuer || "Okta",
        secret: embedded.toUpperCase(),
        algorithm: "SHA1",
        digits: data._embedded.activation.keyLength || 6,
        period: data._embedded.activation.timeStep || 30,
        icon: null,
      };
    }
    throw new Error(t("err.okta.no.secret"));
  }

  return {
    id: crypto.randomUUID(),
    name: account || issuer,
    issuer: issuer || "Okta",
    secret: sharedSecret.toUpperCase(),
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    icon: null,
  };
}
