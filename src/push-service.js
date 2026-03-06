// ── Push Notification Service ────────────────────────────────────────────────
// Manages Web Push API subscriptions and push notification interactions.
// Requires a backend server for sending push messages.

import { t } from "./i18n.js";

const PUSH_SERVER_KEY_STORAGE = "totp_authenticator_push_vapid";
const PUSH_ENDPOINT_STORAGE = "totp_authenticator_push_endpoint";

/**
 * Check if push notifications are supported.
 */
export function isPushSupported() {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

/**
 * Get current push notification permission state.
 * @returns {"granted" | "denied" | "default"}
 */
export function getPushPermission() {
  if (!("Notification" in window)) return "denied";
  return Notification.permission;
}

/**
 * Request push notification permission.
 * @returns {Promise<"granted" | "denied" | "default">}
 */
export async function requestPushPermission() {
  if (!("Notification" in window)) return "denied";
  return Notification.requestPermission();
}

/**
 * Register the service worker if not already registered.
 */
export async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) throw new Error(t("err.sw.not.supported"));
  const reg = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;
  return reg;
}

/**
 * Subscribe to push notifications.
 * @param {string} vapidPublicKey - The VAPID public key from the server (base64url encoded)
 * @returns {PushSubscription}
 */
export async function subscribePush(vapidPublicKey) {
  const reg = await registerServiceWorker();
  const permission = await requestPushPermission();
  if (permission !== "granted") {
    throw new Error(t("err.notification.denied"));
  }

  // Convert VAPID key from base64url to Uint8Array
  const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey);

  const subscription = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey,
  });

  // Store subscription info locally
  const subJson = subscription.toJSON();
  localStorage.setItem(PUSH_ENDPOINT_STORAGE, JSON.stringify(subJson));

  return subscription;
}

/**
 * Get current push subscription, if any.
 */
export async function getCurrentSubscription() {
  try {
    if (!("serviceWorker" in navigator)) return null;
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return null;
    return await reg.pushManager.getSubscription();
  } catch {
    return null;
  }
}

/**
 * Unsubscribe from push notifications.
 */
export async function unsubscribePush() {
  const sub = await getCurrentSubscription();
  if (sub) {
    await sub.unsubscribe();
  }
  localStorage.removeItem(PUSH_ENDPOINT_STORAGE);
}

/**
 * Send push subscription to the backend server for registration.
 * @param {string} serverUrl - The push server registration endpoint
 * @param {PushSubscription} subscription - The push subscription
 * @param {string} deviceName - A friendly name for this device
 */
export async function registerWithServer(serverUrl, subscription, deviceName) {
  const resp = await fetch(serverUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      subscription: subscription.toJSON(),
      deviceName: deviceName || t("app.name"),
      timestamp: new Date().toISOString(),
    }),
  });

  if (!resp.ok) {
    throw new Error(`${t("err.push.register.failed")} (${resp.status})`);
  }

  return resp.json();
}

/**
 * Send a push approval/denial response back to the server.
 * @param {string} serverUrl - The push server response endpoint
 * @param {string} requestId - The push request ID
 * @param {"approve" | "deny"} action - The user's decision
 */
export async function respondToPush(serverUrl, requestId, action) {
  const resp = await fetch(serverUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      requestId,
      action,
      timestamp: new Date().toISOString(),
    }),
  });

  if (!resp.ok) {
    throw new Error(`${t("err.push.respond.failed")} (${resp.status})`);
  }

  return resp.json();
}

/**
 * Listen for push notification actions from the Service Worker.
 * @param {function} callback - Called with { type, action, data }
 */
export function onPushAction(callback) {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.addEventListener("message", (event) => {
    if (event.data && event.data.type === "push-action") {
      callback(event.data);
    }
  });
}

/**
 * Get stored push server configuration.
 */
export function getPushConfig() {
  const vapid = localStorage.getItem(PUSH_SERVER_KEY_STORAGE);
  const endpoint = localStorage.getItem(PUSH_ENDPOINT_STORAGE);
  return {
    vapidKey: vapid || null,
    subscription: endpoint ? JSON.parse(endpoint) : null,
  };
}

/**
 * Save VAPID public key for push server.
 */
export function saveVapidKey(key) {
  localStorage.setItem(PUSH_SERVER_KEY_STORAGE, key);
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
