# 快捷验证器 (Quick Authenticator)

[English](README.md)

多因素认证客户端，兼容 **Google Authenticator**、**Okta Verify**、**Microsoft Authenticator**、**Duo Mobile**，支持 TOTP / HOTP / Passkey / Push 通知，基于 Tauri 2 + Rust 构建。

## 功能

### OTP 验证码
- TOTP（RFC 6238）— SHA1/SHA256/SHA512，6/8 位，30s/60s 周期
- HOTP（RFC 4226）— 基于计数器的一次性密码，手动刷新
- 通过 `otpauth://totp/` 或 `otpauth://hotp/` URI 导入
- 实时倒计时，颜色警示即将刷新
- 一键复制验证码

### 多平台兼容
- **Google Authenticator** — 标准 TOTP/HOTP，`otpauth-migration://` 批量导入导出
- **Okta Verify** — 扫描 Okta QR 码自动激活
- **Microsoft Authenticator** — 标准 `otpauth://` 格式，完全兼容
- **Duo Mobile** — 扫描 `duo://` 激活码，自动获取 HOTP 密钥

### Passkey / WebAuthn
- ECDSA P-256 密钥对生成
- 私钥 AES-GCM 加密存储（PBKDF2 派生密钥）
- 主密码保护（仅 Passkey 功能需要，OTP 无需密码）
- 支持注册凭证、签名挑战

### Push 通知
- Web Push API 订阅管理
- Service Worker 后台接收推送
- 通知内批准/拒绝操作
- 需自建 VAPID 推送服务器

### 通用
- 账户本地加密存储（Tauri Store / localStorage）
- QR 码扫描与生成
- 无边框窗口，深色 UI
- 跨平台：Windows 11、macOS、Ubuntu
- 双栈运行：桌面应用（Tauri）或 Web 应用（PWA）

## 支持平台

| 平台 | 架构 | 安装包格式 |
|------|------|-----------|
| Windows 11 | x86_64 | `.msi` / `.exe` (NSIS) |
| macOS | Apple Silicon (aarch64) / Intel (x86_64) | `.dmg` / `.app` |
| Ubuntu 22.04+ | x86_64 | `.deb` / `.AppImage` |

## 环境要求

| 工具 | 版本 | 说明 |
|------|------|------|
| Rust | >= 1.77 | Tauri 模式必需 |
| Node.js | >= 18 | |
| WebView2 | Windows 11 内置 | 仅 Windows |
| Xcode CLT | 最新版 | 仅 macOS（`xcode-select --install`） |
| 系统依赖 | 见下方 | 仅 Linux |

### Linux 依赖（Ubuntu/Debian）

```bash
sudo apt-get install -y libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf
```

## 快速开始

```bash
# 安装依赖
npm install

# 开发模式（Tauri 桌面）
npm run dev:desktop

# 开发模式（纯 Web）
npm run dev:web

# 构建桌面安装包（当前平台）
npm run build:desktop

# 构建 Web 版本
npm run build:web
```

### 构建产物

| 平台 | 输出路径 |
|------|---------|
| Windows | `src-tauri/target/release/bundle/nsis/` |
| macOS | `src-tauri/target/release/bundle/dmg/` |
| Linux | `src-tauri/target/release/bundle/deb/` 或 `appimage/` |

## 项目结构

```
authenticator/
├── src/
│   ├── main.js              # 前端 UI（纯 JS，无框架）
│   ├── platform.js          # 平台抽象层（Tauri / Web 双栈）
│   ├── web-backend.js       # Web 模式后端（纯 JS OTP 实现）
│   ├── tauri-backend.js     # Tauri 模式后端（调用 Rust）
│   ├── qr.js                # QR 码扫描与生成
│   ├── google-migrate.js    # Google Authenticator 导入导出（protobuf）
│   ├── okta-activate.js     # Okta Verify 激活
│   ├── duo-activate.js      # Duo Mobile 激活
│   ├── passkey-store.js     # Passkey 加密存储
│   ├── push-service.js      # Web Push API 管理
│   └── stubs/
│       └── tauri-stub.js    # Web 模式下 Tauri API 桩
├── public/
│   ├── sw.js                # Service Worker（缓存 + Push）
│   ├── manifest.json        # PWA manifest
│   └── icons/               # 应用图标
├── index.html
├── vite.config.js           # Vite 配置（双模式构建）
├── package.json
└── src-tauri/
    ├── Cargo.toml           # Rust 依赖（totp-rs, serde, etc.）
    ├── build.rs
    ├── capabilities/
    │   └── default.json     # Tauri 权限配置
    └── src/
        ├── main.rs          # Rust 入口
        └── lib.rs           # OTP 核心逻辑 + Tauri 命令
```

## Tauri 命令

| 命令 | 说明 |
|------|------|
| `generate_totp(account)` | 生成当前 TOTP 码及剩余时间 |
| `generate_hotp(account)` | 生成 HOTP 码（不递增计数器） |
| `generate_all_totp(accounts)` | 批量生成所有 TOTP 账户的验证码 |
| `parse_otpauth_uri(uri)` | 解析 `otpauth://` URI（TOTP/HOTP） |
| `validate_secret(secret)` | 验证 Base32 密钥合法性 |
| `generate_new_secret()` | 生成随机 Base32 密钥 |

## 数据存储

| 模式 | 平台 | 存储位置 |
|------|------|----------|
| Tauri 桌面 | Windows | `%APPDATA%\com.quick.authenticator\accounts.json` |
| Tauri 桌面 | macOS | `~/Library/Application Support/com.quick.authenticator/accounts.json` |
| Tauri 桌面 | Linux | `~/.local/share/com.quick.authenticator/accounts.json` |
| Web / PWA | 全部 | `localStorage`（`totp_authenticator_accounts`） |
| Passkey 私钥 | 全部 | `localStorage`（AES-GCM 加密，主密码保护） |
| Push 订阅 | 全部 | `localStorage`（`totp_authenticator_push_endpoint`） |

## npm 脚本

| 脚本 | 说明 |
|------|------|
| `npm run dev:web` | Vite 开发服务器（Web 模式，HTTPS） |
| `npm run build:web` | 生产构建（Web 模式） |
| `npm run build` | 生产构建（Tauri 模式） |
| `npm run dev:desktop` | Tauri 桌面开发 |
| `npm run build:desktop` | Tauri 桌面构建 |
