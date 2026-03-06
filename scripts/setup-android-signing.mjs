#!/usr/bin/env node
/**
 * Setup Android signing for CI builds.
 *
 * 1. Ensure build.gradle.kts has signing config (inject if missing after tauri android init)
 * 2. Decode keystore from ANDROID_KEYSTORE_BASE64 env var
 * 3. Generate keystore.properties from env vars
 *
 * Required env vars:
 *   ANDROID_KEYSTORE_BASE64   - base64 encoded keystore file
 *   ANDROID_KEYSTORE_PASSWORD - keystore password
 *   ANDROID_KEY_ALIAS         - key alias
 *   ANDROID_KEY_PASSWORD      - key password
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import { resolve } from 'path';

const APP_DIR = resolve('src-tauri/gen/android/app');
const GRADLE_FILE = resolve(APP_DIR, 'build.gradle.kts');
const KEYSTORE_FILE = resolve(APP_DIR, 'release.keystore');
const PROPS_FILE = resolve(APP_DIR, 'keystore.properties');

// ── Step 1: Ensure build.gradle.kts has signing config ──

function ensureGradleSigningConfig() {
  if (!existsSync(GRADLE_FILE)) {
    console.error(`ERROR: ${GRADLE_FILE} not found. Run "tauri android init" first.`);
    process.exit(1);
  }

  let content = readFileSync(GRADLE_FILE, 'utf8');

  if (content.includes('keystoreProperties')) {
    console.log('build.gradle.kts already has signing config.');
    return;
  }

  console.log('Injecting signing config into build.gradle.kts...');

  // 1) Add keystoreProperties block before the android {} block (top-level)
  content = content.replace(
    /^(android \{)/m,
    `val keystoreProperties = Properties().apply {
    val propFile = file("keystore.properties")
    if (propFile.exists()) {
        propFile.inputStream().use { load(it) }
    }
}

$1`
  );

  // 2) Add signingConfigs inside android {} after namespace
  content = content.replace(
    /(namespace = [^\n]+)/,
    `$1
    if (keystoreProperties.getProperty("storeFile") != null) {
        signingConfigs {
            create("release") {
                storeFile = file(keystoreProperties["storeFile"] as String)
                storePassword = keystoreProperties["storePassword"] as String
                keyAlias = keystoreProperties["keyAlias"] as String
                keyPassword = keystoreProperties["keyPassword"] as String
            }
        }
    }`
  );

  // 3) Apply signingConfig to release buildType
  content = content.replace(
    /(getByName\("release"\) \{)/,
    `$1
            if (signingConfigs.names.contains("release")) {
                signingConfig = signingConfigs.getByName("release")
            }`
  );

  writeFileSync(GRADLE_FILE, content);
  console.log('Signing config injected.');
}

// ── Step 2: Decode keystore & generate properties ──

function setupKeystoreFiles() {
  const { ANDROID_KEYSTORE_BASE64, ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_ALIAS, ANDROID_KEY_PASSWORD } = process.env;

  if (!ANDROID_KEYSTORE_BASE64) {
    console.error('ERROR: ANDROID_KEYSTORE_BASE64 secret is not set.');
    process.exit(1);
  }

  // Decode keystore
  writeFileSync(KEYSTORE_FILE, Buffer.from(ANDROID_KEYSTORE_BASE64, 'base64'));
  console.log(`Keystore written to ${KEYSTORE_FILE}`);

  // Generate keystore.properties
  const props = [
    `storeFile=release.keystore`,
    `storePassword=${ANDROID_KEYSTORE_PASSWORD}`,
    `keyAlias=${ANDROID_KEY_ALIAS}`,
    `keyPassword=${ANDROID_KEY_PASSWORD}`,
  ].join('\n') + '\n';

  writeFileSync(PROPS_FILE, props);
  console.log('keystore.properties created.');

  // Verify keystore
  try {
    const out = execSync(
      `keytool -list -keystore "${KEYSTORE_FILE}" -storepass "${ANDROID_KEYSTORE_PASSWORD}"`,
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
    );
    console.log('Keystore verified:', out.split('\n').slice(0, 3).join('\n'));
  } catch {
    console.error('WARNING: keytool verification failed. Check keystore and password.');
  }
}

// ── Main ──

ensureGradleSigningConfig();
setupKeystoreFiles();
console.log('Android signing setup complete.');
