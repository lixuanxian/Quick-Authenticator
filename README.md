# Quick Authenticator

[中文文档](README.zh-CN.md)

Multi-factor authentication client, compatible with **Google Authenticator**, **Okta Verify**, **Microsoft Authenticator**, and **Duo Mobile**. Supports TOTP / HOTP / Passkey / Push notifications. Built with Tauri 2 + Rust.

## Features

### OTP Codes
- TOTP (RFC 6238) — SHA1/SHA256/SHA512, 6/8 digits, 30s/60s period
- HOTP (RFC 4226) — Counter-based one-time passwords, manual refresh
- Import via `otpauth://totp/` or `otpauth://hotp/` URI
- Real-time countdown with color warning before refresh
- One-click copy code

### Multi-Platform Compatibility
- **Google Authenticator** — Standard TOTP/HOTP, `otpauth-migration://` batch import/export
- **Okta Verify** — Scan Okta QR code for automatic activation
- **Microsoft Authenticator** — Standard `otpauth://` format, fully compatible
- **Duo Mobile** — Scan `duo://` activation code, automatic HOTP secret retrieval

### Passkey / WebAuthn
- ECDSA P-256 key pair generation
- Private key AES-GCM encrypted storage (PBKDF2 derived key)
- Master password protection (only required for Passkey, not for OTP)
- Credential registration and challenge signing support

### Push Notifications
- Web Push API subscription management
- Service Worker background push receiving
- Approve/Deny actions within notifications
- Requires self-hosted VAPID push server

### General
- Local encrypted account storage (Tauri Store / localStorage)
- QR code scanning and generation
- Frameless window, dark UI
- Cross-platform: Windows 11, macOS, Ubuntu
- Dual-stack: desktop app (Tauri) or web app (PWA)

## Supported Platforms

| Platform | Architecture | Installer Format |
|----------|-------------|------------------|
| Windows 11 | x86_64 | `.msi` / `.exe` (NSIS) |
| macOS | Apple Silicon (aarch64) / Intel (x86_64) | `.dmg` / `.app` |
| Ubuntu 22.04+ | x86_64 | `.deb` / `.AppImage` |

## Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Rust | >= 1.77 | Required for Tauri mode |
| Node.js | >= 18 | |
| WebView2 | Built into Windows 11 | Windows only |
| Xcode CLT | Latest | macOS only (`xcode-select --install`) |
| System libs | See below | Linux only |

### Linux Dependencies (Ubuntu/Debian)

```bash
sudo apt-get install -y libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf
```

## Quick Start

```bash
# Install dependencies
npm install

# Development mode (Tauri desktop)
npm run dev:desktop

# Development mode (Web only)
npm run dev:web

# Build desktop installer (current platform)
npm run build:desktop

# Build Web version
npm run build:web
```

### Build Output

| Platform | Output Location |
|----------|----------------|
| Windows | `src-tauri/target/release/bundle/nsis/` |
| macOS | `src-tauri/target/release/bundle/dmg/` |
| Linux | `src-tauri/target/release/bundle/deb/` or `appimage/` |

## Project Structure

```
authenticator/
├── src/
│   ├── main.js              # Frontend UI (vanilla JS, no framework)
│   ├── platform.js          # Platform abstraction layer (Tauri / Web dual-stack)
│   ├── web-backend.js       # Web mode backend (pure JS OTP implementation)
│   ├── tauri-backend.js     # Tauri mode backend (calls Rust)
│   ├── qr.js                # QR code scanning and generation
│   ├── google-migrate.js    # Google Authenticator import/export (protobuf)
│   ├── okta-activate.js     # Okta Verify activation
│   ├── duo-activate.js      # Duo Mobile activation
│   ├── passkey-store.js     # Passkey encrypted storage
│   ├── push-service.js      # Web Push API management
│   └── stubs/
│       └── tauri-stub.js    # Tauri API stub for Web mode
├── public/
│   ├── sw.js                # Service Worker (cache + Push)
│   ├── manifest.json        # PWA manifest
│   └── icons/               # App icons
├── index.html
├── vite.config.js           # Vite config (dual-mode build)
├── package.json
└── src-tauri/
    ├── Cargo.toml           # Rust dependencies (totp-rs, serde, etc.)
    ├── build.rs
    ├── capabilities/
    │   └── default.json     # Tauri permission config
    └── src/
        ├── main.rs          # Rust entry point
        └── lib.rs           # OTP core logic + Tauri commands
```

## Tauri Commands

| Command | Description |
|---------|-------------|
| `generate_totp(account)` | Generate current TOTP code and remaining time |
| `generate_hotp(account)` | Generate HOTP code (does not increment counter) |
| `generate_all_totp(accounts)` | Batch generate codes for all TOTP accounts |
| `parse_otpauth_uri(uri)` | Parse `otpauth://` URI (TOTP/HOTP) |
| `validate_secret(secret)` | Validate Base32 secret legality |
| `generate_new_secret()` | Generate random Base32 secret |

## Data Storage

| Mode | Platform | Storage Location |
|------|----------|-----------------|
| Tauri Desktop | Windows | `%APPDATA%\com.quick.authenticator\accounts.json` |
| Tauri Desktop | macOS | `~/Library/Application Support/com.quick.authenticator/accounts.json` |
| Tauri Desktop | Linux | `~/.local/share/com.quick.authenticator/accounts.json` |
| Web / PWA | All | `localStorage` (`totp_authenticator_accounts`) |
| Passkey Private Keys | All | `localStorage` (AES-GCM encrypted, master password protected) |
| Push Subscription | All | `localStorage` (`totp_authenticator_push_endpoint`) |

## npm Scripts

| Script | Description |
|--------|-------------|
| `npm run dev:web` | Vite dev server (Web mode, HTTPS) |
| `npm run build:web` | Production build (Web mode) |
| `npm run build` | Production build (Tauri mode) |
| `npm run dev:desktop` | Tauri desktop development |
| `npm run build:desktop` | Tauri desktop build |
