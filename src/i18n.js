// ── Internationalization ─────────────────────────────────────────────────────
// Lightweight i18n module for zh-CN / en-US dual language support.

const LANG_STORAGE_KEY = "totp_authenticator_lang";

const zh = {
  "app.name": "快捷验证器",

  // ── Home ──
  "search.placeholder": "搜索账户…",
  "export.title": "导出到 Google Authenticator",
  "add.account": "添加账户",
  "no.accounts": "没有可导出的账户",
  "empty.title": "还没有账户",
  "empty.sub": "点击右上角 + 添加您的第一个账户",
  "unknown.service": "未知服务",
  "hotp.refresh": "生成下一个码",
  "show.qr": "显示二维码",
  "edit": "编辑",
  "delete": "删除",
  "copied": "已复制!",
  "confirm.delete.account": "确定要删除此账户吗？",

  // ── Form ──
  "form.title.add": "添加账户",
  "form.title.edit": "编辑账户",
  "tab.scan": "扫描",
  "tab.manual": "手动输入",
  "tab.url": "URL 导入",
  "label.type": "类型",
  "type.totp": "TOTP (时间)",
  "type.hotp": "HOTP (计数器)",
  "label.name": "账户名称 *",
  "label.issuer": "发行方",
  "issuer.placeholder": "或输入其他发行方…",
  "label.secret": "密钥 (Base32) *",
  "gen.secret": "生成随机密钥",
  "label.algo": "算法",
  "algo.default": "SHA1 (默认)",
  "label.digits": "位数",
  "digits.6": "6位",
  "digits.8": "8位",
  "label.period": "周期 (秒)",
  "label.counter": "初始计数器",
  "btn.submit.add": "添加账户",
  "btn.submit.edit": "保存修改",
  "btn.scan": "扫描二维码",
  "btn.upload.image": "上传二维码图片",
  "btn.scan.screen": "扫描屏幕二维码",
  "scan.hint": "通过摄像头、图片或屏幕截图识别二维码",
  "alert.no.qr.found": "未在图片中找到二维码",
  "alert.no.qr.screen": "未在屏幕中找到二维码",
  "alert.screen.failed": "屏幕捕获失败：",
  "alert.image.failed": "图片识别失败：",
  "label.uri": "otpauth URI",
  "uri.placeholder": "otpauth://totp/LABEL?secret=SECRET&issuer=ISSUER\n或 oktaverify:// / duo:// / otpauth-migration://...",
  "uri.hint": "支持 otpauth:// / oktaverify:// / duo:// / Google Authenticator 导出链接",
  "btn.import": "解析并导入",
  "secret.valid": "✓ 有效的 Base32 密钥",
  "secret.invalid": "✗ 无效的密钥格式",
  "secret.generated": "✓ 已生成随机密钥",
  "alert.name.secret.required": "账户名称和密钥为必填项",
  "alert.invalid.secret": "无效的 Base32 密钥",

  // ── Activation ──
  "activating": "激活中",
  "activating.message": "正在与服务器通信…",
  "alert.okta.failed": "Okta 激活失败：",
  "alert.duo.failed": "Duo 激活失败：",
  "alert.parse.failed": "解析失败：",
  "alert.import.all.exist": (n) => `解析到 ${n} 个账户，但全部已存在。`,
  "alert.scan.all.exist": (n) => `扫描到 ${n} 个账户，但全部已存在。`,
  "alert.import.success": (n, skip) => `成功导入 ${n} 个账户` + (skip > 0 ? `（跳过 ${skip} 个重复）` : ""),
  "alert.import.failed": "Google Authenticator 导入失败：",
  "alert.unsupported.qr": "不支持的二维码格式。\n\n支持：otpauth://、oktaverify://、duo://、Google Authenticator 导出",
  "alert.camera.failed": "无法启动摄像头：",

  // ── QR Modal ──
  "modal.scan.title": "扫描二维码",
  "modal.scan.hint": "将摄像头对准 otpauth:// 二维码",
  "modal.export.qr": "导出二维码",
  "modal.export.migration": "导出到 Google Authenticator",
  "modal.migration.hint": (total) => `在 Google Authenticator 中选择「导入帐号」→「扫描二维码」${total > 1 ? `<br>共 ${total} 页，请依次扫描` : ""}`,
  "modal.migration.count": (n) => `共 ${n} 个账户`,
  "alert.export.failed": "导出失败：",
  "alert.qr.failed": "生成二维码失败：",

  // ── Passkeys ──
  "passkey.empty.title": "还没有 Passkey",
  "passkey.empty.sub": "点击右上角 + 添加您的第一个 Passkey",
  "passkey.add.title": "添加 Passkey",
  "passkey.add.btn": "添加 Passkey",
  "label.rpid": "域名 (RP ID) *",
  "label.rpname": "服务名称",
  "label.username": "用户名 *",
  "label.displayname": "显示名称",
  "displayname.placeholder": "显示名称（可选）",
  "btn.create.passkey": "创建 Passkey",
  "alert.rpid.username.required": "域名和用户名为必填项",
  "alert.create.failed": "创建失败：",
  "confirm.delete.passkey": "确定要删除此 Passkey 吗？",
  "sign.verify": "签名验证",

  // ── Master Password ──
  "modal.set.master": "设置主密码",
  "master.pw.hint": "主密码用于加密 Passkey 私钥。请牢记此密码，丢失后无法恢复。",
  "label.master.pw": "主密码",
  "master.pw.placeholder": "输入主密码",
  "label.confirm.pw": "确认密码",
  "confirm.pw.placeholder": "再次输入",
  "btn.set.pw": "设置密码",
  "err.pw.min.length": "密码至少 4 个字符",
  "err.pw.mismatch": "两次密码不一致",
  "modal.enter.master": "输入主密码",
  "btn.unlock": "解锁",
  "err.pw.wrong": "密码错误",

  // ── Sign Challenge ──
  "modal.sign.title": "签名验证",
  "label.challenge": "Challenge (Base64)",
  "challenge.placeholder": "粘贴 Base64 编码的 challenge",
  "btn.sign": "签名",
  "label.sign.result": "签名结果 (Base64)",
  "err.enter.challenge": "请输入 challenge",

  // ── Push ──
  "push.title": "推送通知",
  "push.settings": "推送通知设置",
  "push.browser.support": "浏览器支持",
  "push.supported": "支持",
  "push.not.supported": "不支持",
  "push.permission": "通知权限",
  "push.granted": "已授权",
  "push.denied": "已拒绝",
  "push.default": "未请求",
  "push.subscription": "推送订阅",
  "push.subscribed": "已订阅",
  "push.not.subscribed": "未订阅",
  "push.not.supported.msg": "当前浏览器不支持 Web Push API",
  "push.vapid.label": "VAPID 公钥",
  "push.vapid.placeholder": "服务器提供的 VAPID 公钥 (Base64URL)",
  "push.vapid.hint": "从推送服务器获取此密钥",
  "push.enable": "启用推送通知",
  "push.endpoint": "推送端点",
  "push.unsubscribe": "取消推送订阅",
  "push.test.label": "测试推送通知",
  "push.test.btn": "发送测试通知",
  "alert.enter.vapid": "请输入 VAPID 公钥",
  "alert.subscribe.failed": "订阅失败：",
  "alert.unsubscribe.failed": "取消订阅失败：",
  "alert.grant.permission": "请先授权通知权限",
  "push.test.body": "这是一条测试推送通知",

  // ── Push Approval ──
  "push.auth.request": "认证请求",
  "push.new.login": "收到新的登录请求",
  "push.source": "来源：",
  "push.deny": "拒绝",
  "push.approve": "批准",

  // ── Settings ──
  "settings.theme": "主题",
  "settings.theme.light": "浅色",
  "settings.theme.dark": "深色",
  "settings.language": "语言",
  "tray.show.hide": "显示 / 隐藏",
  "tray.quit": "退出",

  // ── Update ──
  "update.available": "发现新版本",
  "update.reload": "刷新",

  "err.okta.parse": "无法解析 Okta 二维码 URI",
  "err.okta.missing.params": "二维码缺少必要的激活参数 (token/server)",
  "err.okta.expired": "激活令牌已过期，请重新生成二维码",
  "err.okta.rejected": "激活被拒绝，可能已达到设备注册上限",
  "err.okta.network": "无法连接到 Okta 服务器，请检查网络",
  "err.okta.no.secret": "Okta 未返回 TOTP 密钥，注册可能未完成",

  // ── Errors (duo-activate) ──
  "err.duo.invalid": "不是有效的 Duo 激活码",
  "err.duo.empty": "Duo 激活码为空",
  "err.duo.expired": "Duo 激活码无效或已过期",
  "err.duo.network": "无法连接到 Duo 服务器，请检查网络",
  "err.duo.no.secret": "Duo 未返回 HOTP 密钥，激活可能未完成",

  // ── Errors (passkey-store) ──
  "err.no.master.pw": "未设置主密码",
  "err.master.pw.wrong": "主密码错误",
  "err.passkey.not.found": "Passkey 不存在",

  // ── Errors (push-service) ──
  "err.sw.not.supported": "Service Worker 不支持",
  "err.notification.denied": "通知权限被拒绝",
  "err.push.register.failed": "推送服务器注册失败",
  "err.push.respond.failed": "推送响应失败",

  // ── Errors (google-migrate) ──
  "err.not.google.format": "不是 Google Authenticator 导出格式",
  "err.missing.data": "缺少 data 参数",
  "err.no.accounts": "未找到任何账户数据",

  // ── Errors (generic API) ──
  "err.okta.api": (status, detail) => `Okta API 错误 (${status}): ${detail}`,
  "err.duo.api": (status, detail) => `Duo API 错误 (${status}): ${detail}`,
};

const en = {
  "app.name": "Quick Authenticator",

  // ── Home ──
  "search.placeholder": "Search accounts...",
  "export.title": "Export to Google Authenticator",
  "add.account": "Add Account",
  "no.accounts": "No accounts to export",
  "empty.title": "No accounts yet",
  "empty.sub": "Tap + in the top right to add your first account",
  "unknown.service": "Unknown",
  "hotp.refresh": "Generate next code",
  "show.qr": "Show QR code",
  "edit": "Edit",
  "delete": "Delete",
  "copied": "Copied!",
  "confirm.delete.account": "Are you sure you want to delete this account?",

  // ── Form ──
  "form.title.add": "Add Account",
  "form.title.edit": "Edit Account",
  "tab.scan": "Scan",
  "tab.manual": "Manual Entry",
  "tab.url": "URL Import",
  "label.type": "Type",
  "type.totp": "TOTP (Time)",
  "type.hotp": "HOTP (Counter)",
  "label.name": "Account Name *",
  "label.issuer": "Issuer",
  "issuer.placeholder": "Or enter other issuer...",
  "label.secret": "Secret (Base32) *",
  "gen.secret": "Generate random secret",
  "label.algo": "Algorithm",
  "algo.default": "SHA1 (Default)",
  "label.digits": "Digits",
  "digits.6": "6 digits",
  "digits.8": "8 digits",
  "label.period": "Period (sec)",
  "label.counter": "Initial Counter",
  "btn.submit.add": "Add Account",
  "btn.submit.edit": "Save Changes",
  "btn.scan": "Scan QR Code",
  "btn.upload.image": "Upload QR Image",
  "btn.scan.screen": "Scan Screen QR",
  "scan.hint": "Scan QR codes via camera, image upload, or screen capture",
  "alert.no.qr.found": "No QR code found in image",
  "alert.no.qr.screen": "No QR code found on screen",
  "alert.screen.failed": "Screen capture failed: ",
  "alert.image.failed": "Image scan failed: ",
  "label.uri": "otpauth URI",
  "uri.placeholder": "otpauth://totp/LABEL?secret=SECRET&issuer=ISSUER\nor oktaverify:// / duo:// / otpauth-migration://...",
  "uri.hint": "Supports otpauth:// / oktaverify:// / duo:// / Google Authenticator export",
  "btn.import": "Parse & Import",
  "secret.valid": "✓ Valid Base32 secret",
  "secret.invalid": "✗ Invalid secret format",
  "secret.generated": "✓ Random secret generated",
  "alert.name.secret.required": "Account name and secret are required",
  "alert.invalid.secret": "Invalid Base32 secret",

  // ── Activation ──
  "activating": "Activating",
  "activating.message": "Communicating with server...",
  "alert.okta.failed": "Okta activation failed: ",
  "alert.duo.failed": "Duo activation failed: ",
  "alert.parse.failed": "Parse failed: ",
  "alert.import.all.exist": (n) => `Found ${n} accounts, but all already exist.`,
  "alert.scan.all.exist": (n) => `Scanned ${n} accounts, but all already exist.`,
  "alert.import.success": (n, skip) => `Successfully imported ${n} account(s)` + (skip > 0 ? ` (skipped ${skip} duplicates)` : ""),
  "alert.import.failed": "Google Authenticator import failed: ",
  "alert.unsupported.qr": "Unsupported QR code format.\n\nSupported: otpauth://, oktaverify://, duo://, Google Authenticator export",
  "alert.camera.failed": "Could not start camera: ",

  // ── QR Modal ──
  "modal.scan.title": "Scan QR Code",
  "modal.scan.hint": "Point camera at an otpauth:// QR code",
  "modal.export.qr": "Export QR Code",
  "modal.export.migration": "Export to Google Authenticator",
  "modal.migration.hint": (total) => `In Google Authenticator, select "Import accounts" > "Scan QR code"${total > 1 ? `<br>${total} pages total, scan each in order` : ""}`,
  "modal.migration.count": (n) => `${n} account(s) total`,
  "alert.export.failed": "Export failed: ",
  "alert.qr.failed": "QR generation failed: ",

  // ── Passkeys ──
  "passkey.empty.title": "No Passkeys yet",
  "passkey.empty.sub": "Tap + in the top right to add your first Passkey",
  "passkey.add.title": "Add Passkey",
  "passkey.add.btn": "Add Passkey",
  "label.rpid": "Domain (RP ID) *",
  "label.rpname": "Service Name",
  "label.username": "Username *",
  "label.displayname": "Display Name",
  "displayname.placeholder": "Display name (optional)",
  "btn.create.passkey": "Create Passkey",
  "alert.rpid.username.required": "Domain and username are required",
  "alert.create.failed": "Creation failed: ",
  "confirm.delete.passkey": "Are you sure you want to delete this Passkey?",
  "sign.verify": "Sign & Verify",

  // ── Master Password ──
  "modal.set.master": "Set Master Password",
  "master.pw.hint": "Master password encrypts Passkey private keys. Remember this password — it cannot be recovered if lost.",
  "label.master.pw": "Master Password",
  "master.pw.placeholder": "Enter master password",
  "label.confirm.pw": "Confirm Password",
  "confirm.pw.placeholder": "Enter again",
  "btn.set.pw": "Set Password",
  "err.pw.min.length": "Password must be at least 4 characters",
  "err.pw.mismatch": "Passwords do not match",
  "modal.enter.master": "Enter Master Password",
  "btn.unlock": "Unlock",
  "err.pw.wrong": "Incorrect password",

  // ── Sign Challenge ──
  "modal.sign.title": "Sign & Verify",
  "label.challenge": "Challenge (Base64)",
  "challenge.placeholder": "Paste Base64-encoded challenge",
  "btn.sign": "Sign",
  "label.sign.result": "Signature Result (Base64)",
  "err.enter.challenge": "Please enter challenge",

  // ── Push ──
  "push.title": "Push Notifications",
  "push.settings": "Push notification settings",
  "push.browser.support": "Browser Support",
  "push.supported": "Supported",
  "push.not.supported": "Not Supported",
  "push.permission": "Notification Permission",
  "push.granted": "Granted",
  "push.denied": "Denied",
  "push.default": "Not Requested",
  "push.subscription": "Push Subscription",
  "push.subscribed": "Subscribed",
  "push.not.subscribed": "Not Subscribed",
  "push.not.supported.msg": "Web Push API is not supported in this browser",
  "push.vapid.label": "VAPID Public Key",
  "push.vapid.placeholder": "VAPID public key from server (Base64URL)",
  "push.vapid.hint": "Get this key from your push server",
  "push.enable": "Enable Push Notifications",
  "push.endpoint": "Push Endpoint",
  "push.unsubscribe": "Unsubscribe Push",
  "push.test.label": "Test push notification",
  "push.test.btn": "Send Test Notification",
  "alert.enter.vapid": "Please enter VAPID public key",
  "alert.subscribe.failed": "Subscribe failed: ",
  "alert.unsubscribe.failed": "Unsubscribe failed: ",
  "alert.grant.permission": "Please grant notification permission first",
  "push.test.body": "This is a test push notification",

  // ── Push Approval ──
  "push.auth.request": "Authentication Request",
  "push.new.login": "New login request received",
  "push.source": "Source: ",
  "push.deny": "Deny",
  "push.approve": "Approve",

  // ── Settings ──
  "settings.theme": "Theme",
  "settings.theme.light": "Light",
  "settings.theme.dark": "Dark",
  "settings.language": "Language",
  "tray.show.hide": "Show / Hide",
  "tray.quit": "Quit",

  // ── Update ──
  "update.available": "New version available",
  "update.reload": "Reload",

  // ── Errors (okta-activate) ──
  "err.okta.parse": "Cannot parse Okta QR code URI",
  "err.okta.missing.params": "QR code missing required activation parameters (token/server)",
  "err.okta.expired": "Activation token has expired, please regenerate the QR code",
  "err.okta.rejected": "Activation rejected, device registration limit may have been reached",
  "err.okta.network": "Cannot connect to Okta server, please check your network",
  "err.okta.no.secret": "Okta did not return a TOTP secret, registration may be incomplete",

  // ── Errors (duo-activate) ──
  "err.duo.invalid": "Not a valid Duo activation code",
  "err.duo.empty": "Duo activation code is empty",
  "err.duo.expired": "Duo activation code is invalid or expired",
  "err.duo.network": "Cannot connect to Duo server, please check your network",
  "err.duo.no.secret": "Duo did not return an HOTP secret, activation may be incomplete",

  // ── Errors (passkey-store) ──
  "err.no.master.pw": "Master password not set",
  "err.master.pw.wrong": "Incorrect master password",
  "err.passkey.not.found": "Passkey not found",

  // ── Errors (push-service) ──
  "err.sw.not.supported": "Service Worker not supported",
  "err.notification.denied": "Notification permission denied",
  "err.push.register.failed": "Push server registration failed",
  "err.push.respond.failed": "Push response failed",

  // ── Errors (google-migrate) ──
  "err.not.google.format": "Not a Google Authenticator export format",
  "err.missing.data": "Missing data parameter",
  "err.no.accounts": "No account data found",

  // ── Errors (generic API) ──
  "err.okta.api": (status, detail) => `Okta API error (${status}): ${detail}`,
  "err.duo.api": (status, detail) => `Duo API error (${status}): ${detail}`,
};

const translations = { zh, en };
let currentLang = "zh";

/**
 * Initialize language from localStorage or browser preference.
 */
export function initLang() {
  const saved = localStorage.getItem(LANG_STORAGE_KEY);
  if (saved && translations[saved]) {
    currentLang = saved;
  }
  document.documentElement.lang = currentLang === "zh" ? "zh-CN" : "en";
}

export function getLang() {
  return currentLang;
}

export function setLang(lang) {
  currentLang = lang;
  localStorage.setItem(LANG_STORAGE_KEY, lang);
  document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
}

/**
 * Translate a key. Supports function values for interpolation.
 * @param {string} key
 * @param  {...any} args - arguments passed to function-valued translations
 */
export function t(key, ...args) {
  const val = translations[currentLang]?.[key] ?? translations.zh[key] ?? key;
  return typeof val === "function" ? val(...args) : val;
}

/**
 * Read a CSS custom property value from :root.
 */
export function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
