use serde::{Deserialize, Serialize};
use totp_rs::{Algorithm, Secret, TOTP};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Account {
    pub id: String,
    pub name: String,
    pub issuer: String,
    pub secret: String,
    pub algorithm: String,
    pub digits: u32,
    pub period: u64,
    #[serde(default = "default_account_type")]
    pub account_type: String,
    #[serde(default)]
    pub counter: u64,
    pub icon: Option<String>,
}

fn default_account_type() -> String {
    "totp".to_string()
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TotpResult {
    pub code: String,
    pub remaining: u64,
    pub progress: f64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct HotpResult {
    pub code: String,
    pub counter: u64,
}

fn parse_algorithm(algo: &str) -> Algorithm {
    match algo.to_uppercase().as_str() {
        "SHA256" => Algorithm::SHA256,
        "SHA512" => Algorithm::SHA512,
        _ => Algorithm::SHA1,
    }
}

fn build_totp(account: &Account) -> Result<TOTP, String> {
    let secret = Secret::Encoded(account.secret.to_uppercase())
        .to_bytes()
        .map_err(|e| format!("Invalid secret: {}", e))?;

    TOTP::new(
        parse_algorithm(&account.algorithm),
        account.digits as usize,
        1,
        account.period,
        secret,
        Some(account.issuer.clone()),
        account.name.clone(),
    )
    .map_err(|e| format!("TOTP error: {}", e))
}

#[tauri::command]
fn generate_totp(account: Account) -> Result<TotpResult, String> {
    let totp = build_totp(&account)?;
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_secs();

    let code = totp.generate(now);
    let step = account.period;
    let remaining = step - (now % step);
    let progress = remaining as f64 / step as f64;

    Ok(TotpResult {
        code,
        remaining,
        progress,
    })
}

#[tauri::command]
fn generate_hotp(account: Account) -> Result<HotpResult, String> {
    let totp = build_totp(&account)?;
    let code = totp.generate(account.counter);

    Ok(HotpResult {
        code,
        counter: account.counter,
    })
}

#[tauri::command]
fn generate_all_totp(accounts: Vec<Account>) -> Vec<(String, Result<TotpResult, String>)> {
    accounts
        .into_iter()
        .filter(|acc| acc.account_type != "hotp")
        .map(|acc| {
            let id = acc.id.clone();
            (id, generate_totp(acc))
        })
        .collect()
}

#[tauri::command]
fn parse_otpauth_uri(uri: String) -> Result<Account, String> {
    // otpauth://totp/LABEL?secret=SECRET&issuer=ISSUER&algorithm=SHA1&digits=6&period=30
    // otpauth://hotp/LABEL?secret=SECRET&issuer=ISSUER&counter=0
    let (account_type, without_scheme) = if uri.starts_with("otpauth://totp/") {
        ("totp", uri.trim_start_matches("otpauth://totp/"))
    } else if uri.starts_with("otpauth://hotp/") {
        ("hotp", uri.trim_start_matches("otpauth://hotp/"))
    } else {
        return Err("Only TOTP and HOTP URIs are supported".into());
    };

    let (label_encoded, query) = without_scheme
        .split_once('?')
        .ok_or("Missing query parameters")?;

    let label = urlencoding_decode(label_encoded);

    let (issuer_from_label, name) = if label.contains(':') {
        let parts: Vec<&str> = label.splitn(2, ':').collect();
        (parts[0].trim().to_string(), parts[1].trim().to_string())
    } else {
        (String::new(), label.trim().to_string())
    };

    let mut secret = String::new();
    let mut issuer = issuer_from_label;
    let mut algorithm = "SHA1".to_string();
    let mut digits = 6u32;
    let mut period = 30u64;
    let mut counter = 0u64;

    for param in query.split('&') {
        if let Some((k, v)) = param.split_once('=') {
            match k {
                "secret" => secret = v.to_uppercase(),
                "issuer" => issuer = urlencoding_decode(v),
                "algorithm" => algorithm = v.to_string(),
                "digits" => digits = v.parse().unwrap_or(6),
                "period" => period = v.parse().unwrap_or(30),
                "counter" => counter = v.parse().unwrap_or(0),
                _ => {}
            }
        }
    }

    if secret.is_empty() {
        return Err("Secret is required".into());
    }

    Ok(Account {
        id: Uuid::new_v4().to_string(),
        name,
        issuer,
        secret,
        algorithm,
        digits,
        period,
        account_type: account_type.to_string(),
        counter,
        icon: None,
    })
}

#[tauri::command]
fn validate_secret(secret: String) -> bool {
    Secret::Encoded(secret.to_uppercase()).to_bytes().is_ok()
}

#[tauri::command]
fn generate_new_secret() -> String {
    use totp_rs::Secret;
    let secret = Secret::generate_secret();
    match secret {
        Secret::Raw(bytes) => {
            base32::encode(base32::Alphabet::RFC4648 { padding: false }, &bytes)
        }
        Secret::Encoded(s) => s,
    }
}

fn urlencoding_decode(s: &str) -> String {
    let s = s.replace('+', " ");
    let mut result = String::new();
    let mut chars = s.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '%' {
            let h1 = chars.next().unwrap_or('0');
            let h2 = chars.next().unwrap_or('0');
            let hex = format!("{}{}", h1, h2);
            if let Ok(byte) = u8::from_str_radix(&hex, 16) {
                result.push(byte as char);
            }
        } else {
            result.push(c);
        }
    }
    result
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_clipboard_manager::init())
        .invoke_handler(tauri::generate_handler![
            generate_totp,
            generate_hotp,
            generate_all_totp,
            parse_otpauth_uri,
            validate_secret,
            generate_new_secret,
        ])
        .setup(|app| {
            #[cfg(desktop)]
            {
                use tauri::{
                    image::Image,
                    menu::{MenuBuilder, MenuItemBuilder},
                    tray::TrayIconBuilder,
                    Manager,
                };

                let show_hide =
                    MenuItemBuilder::with_id("show_hide", "Show / Hide").build(app)?;
                let quit = MenuItemBuilder::with_id("quit", "Quit").build(app)?;
                let menu = MenuBuilder::new(app)
                    .item(&show_hide)
                    .separator()
                    .item(&quit)
                    .build()?;

                let tray_icon =
                    Image::from_bytes(include_bytes!("../icons/tray-icon.png"))?;

                TrayIconBuilder::new()
                    .icon(tray_icon)
                    .tooltip("Quick Authenticator")
                    .menu(&menu)
                    .on_menu_event(|app, event| match event.id().as_ref() {
                        "show_hide" => {
                            if let Some(window) = app.get_webview_window("main") {
                                if window.is_visible().unwrap_or(false) {
                                    let _ = window.hide();
                                } else {
                                    let _ = window.show();
                                    let _ = window.set_focus();
                                }
                            }
                        }
                        "quit" => {
                            app.exit(0);
                        }
                        _ => {}
                    })
                    .on_tray_icon_event(|tray, event| {
                        use tauri::tray::{MouseButton, TrayIconEvent};
                        if let TrayIconEvent::Click {
                            button: MouseButton::Left,
                            ..
                        } = event
                        {
                            let app = tray.app_handle();
                            if let Some(window) = app.get_webview_window("main") {
                                if window.is_visible().unwrap_or(false) {
                                    let _ = window.hide();
                                } else {
                                    let _ = window.show();
                                    let _ = window.set_focus();
                                }
                            }
                        }
                    })
                    .build(app)?;
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            #[cfg(desktop)]
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    #[allow(unused_variables)]
    app.run(|app_handle, event| {
        #[cfg(target_os = "macos")]
        if let tauri::RunEvent::Reopen { .. } = event {
            use tauri::Manager;
            if let Some(window) = app_handle.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }
    });
}
