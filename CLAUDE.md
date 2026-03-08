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
- `src/web-backend.js` — OTP 核心算法（TOTP/HOTP/URI 解析）+ Web 存储，所有平台共用
- `src/tauri-backend.js` — Tauri 专有 API（plugin-store 存储、clipboard、窗口控制），OTP 逻辑从 web-backend.js 导入复用
- `src/main.js` — 全部 UI 逻辑（~75KB，单文件，纯 JS DOM 操作，`render()` 驱动刷新）
- `src/i18n.js` — 中英双语（zh-CN / en-US），通过 `t()` 函数取文本
- `src-tauri/src/lib.rs` — Rust 后端：仅窗口管理、系统托盘、插件注册（无业务逻辑）

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
- **共享优先**：业务逻辑（OTP、URI 解析等）统一在 `web-backend.js` 用 JS 实现，`tauri-backend.js` 直接导入复用，仅窗口控制等原生 API 走 Rust
- **窗口**：桌面模式无原生标题栏（`decorations: false, transparent: true`），自定义拖拽
- **相对路径**：禁止硬编码绝对路径引用静态资源，以支持子路径部署（`VITE_BASE_PATH`）：
  - `index.html`：使用相对路径（`icons/icon.svg`，非 `/icons/icon.svg`）
  - `public/` 下的 CSS：使用相对路径（`url('./file.ttf')`）
  - JS 运行时拼接路径：使用 `` `${import.meta.env.BASE_URL}icons/...` ``
  - `public/sw.js`：通过 `new URL('./', self.location).pathname` 动态获取 BASE

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
| `src-tauri/src/lib.rs` | Rust：窗口管理、系统托盘、插件注册 |
| `vite.config.js` | Vite 配置 + Okta CORS proxy 中间件 |

## Adding Features

1. **新业务逻辑**：在 `web-backend.js` 用 JS 实现并导出，`tauri-backend.js` 通过 `export { fn } from './web-backend.js'` 复用
2. **Tauri 专有功能**（窗口、原生 API）：`tauri-backend.js` 直接调用 Tauri API，`web-backend.js` 提供 no-op 桩
3. **统一暴露**：`platform.js` 的 `platform` 对象中添加
4. **新文本**：`i18n.js` 中 `zh` 和 `en` 对象同时添加 key
