# CLAUDE.md

## Project Overview

快捷验证器（Quick Authenticator）— 多因素认证客户端。Tauri 2 + Rust + Vanilla JS，支持 TOTP / HOTP / Passkey / Push。兼容 Google Authenticator、Okta Verify、Duo Mobile。

## Build & Run

```bash
npm install              # 安装依赖
npm run dev:desktop      # Tauri 桌面开发（port 3020）
npm run dev:web          # Web/PWA 开发（HTTPS, port 3020）
npm run build:desktop    # 桌面生产构建
npm run build:web        # Web 生产构建（输出到 dist-web）
npm run dev:android      # Android 开发（需先 npm run init:android）
```

## Architecture

**双栈运行**：同一前端代码运行于 Tauri 桌面和 Web/PWA 两种模式。

- `src/platform.js` — 平台抽象层，检测 `window.__TAURI_INTERNALS__` 后动态导入对应后端（顶层 await）
- `src/tauri-backend.js` — Tauri 模式，invoke Rust 命令
- `src/web-backend.js` — Web 模式，纯 JS 实现 OTP 算法
- `src/main.js` — 全部 UI 逻辑（~75KB，单文件，纯 JS DOM 操作，`render()` 驱动刷新）
- `src/i18n.js` — 中英双语（zh-CN / en-US），通过 `t()` 函数取文本
- `src-tauri/src/lib.rs` — Rust 后端：OTP 核心 + Tauri 命令

Web 模式下 Tauri API 通过 `src/stubs/tauri-stub.js` 桩模块替代（vite resolve alias）。

## Key Conventions

- **纯 JS，无框架**：手写 DOM，`main.js` 中 `render()` 刷新视图
- **ES Modules**：`"type": "module"`，所有 `.js` 使用 `import/export`
- **双语 UI**：`i18n.js` 管理，`t("key")` 获取文本，支持运行时切换
- **双主题**：dark（默认）/ light，CSS 变量驱动，跟随系统或手动切换
- **Account 数据模型**：
  ```js
  { id, name, issuer, secret, algorithm, digits, period, account_type, counter, icon }
  ```
  `account_type`: `"totp"` | `"hotp"`
- **持久化**：桌面 `tauri-plugin-store`，Web `localStorage`
- **Rust 新字段**：必须加 `#[serde(default)]` 保证向后兼容
- **窗口**：桌面模式无原生标题栏（`decorations: false, transparent: true`），自定义拖拽

## File Map

| File | Role |
|------|------|
| `src/main.js` | UI 全部逻辑：视图、事件、状态 |
| `src/platform.js` | 平台检测 + 统一 API 导出 |
| `src/i18n.js` | 国际化（zh/en） |
| `src/qr.js` | QR 扫描（html5-qrcode）+ 生成（qrcode） |
| `src/google-migrate.js` | `otpauth-migration://` protobuf 编解码 |
| `src/okta-activate.js` | Okta Verify 激活（CORS 由 vite proxy 解决） |
| `src/duo-activate.js` | Duo Mobile 激活（`duo://` URI） |
| `src/passkey-store.js` | Passkey 加密存储（PBKDF2 + AES-GCM） |
| `src/push-service.js` | Web Push 订阅管理 |
| `public/sw.js` | Service Worker（缓存 + Push 通知） |
| `src-tauri/src/lib.rs` | Rust OTP 实现 + Tauri 命令 |
| `vite.config.js` | Vite 配置 + Okta CORS proxy 中间件 |

## Adding Features

1. **新 Tauri 命令**：`lib.rs` 加 `#[tauri::command]` 函数 → 注册到 `invoke_handler`
2. **新 Web API**：`web-backend.js` 添加导出
3. **统一暴露**：`platform.js` 的 `platform` 对象中添加
4. **Tauri 桥接**：`tauri-backend.js` 添加 invoke 包装
5. **新字段**：Rust 侧 `#[serde(default)]`，JS 侧提供默认值
6. **新文本**：`i18n.js` 中 `zh` 和 `en` 对象同时添加 key
