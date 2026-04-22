use chrono::{Local, TimeZone};
use std::collections::HashMap;
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use notify::{EventKind, RecursiveMode, Watcher};
use reqwest::{Client, Proxy};
use serde::{Deserialize, Serialize};
use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, Runtime};
use tokio::process::{Child, Command};

static USAGE_BINDINGS_LOCK: Mutex<()> = Mutex::new(());
static LOGIN_CANCEL_REQUESTED: AtomicBool = AtomicBool::new(false);
static AUTO_REFRESH_RUNNING: AtomicBool = AtomicBool::new(false);
static LAST_AUTO_REFRESH_MS: Mutex<u64> = Mutex::new(0);
const TRAY_ID: &str = "main-tray";
const TRAY_MENU_OPEN_ID: &str = "tray-open";
const TRAY_MENU_EXIT_ID: &str = "tray-exit";
const MIN_VALID_EPOCH_MS: i64 = 946684800000; // 2000-01-01T00:00:00Z
const MAX_VALID_EPOCH_MS: i64 = 4102444800000; // 2100-01-01T00:00:00Z
const DEFAULT_LOGIN_TIMEOUT_SECONDS: u64 = 180;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

/// 获取应用数据目录
fn get_app_data_dir() -> Result<PathBuf, String> {
    dirs::data_local_dir()
        .map(|p| p.join("codex-manager"))
        .ok_or_else(|| "Cannot find app data directory".to_string())
}

/// 获取用户目录下的 .codex_manager 目录
fn get_codex_manager_dir() -> Result<PathBuf, String> {
    dirs::home_dir()
        .map(|p| p.join(".codex_manager"))
        .ok_or_else(|| "Cannot find home directory".to_string())
}

/// 获取accounts.json路径
fn get_accounts_store_path() -> Result<PathBuf, String> {
    let dir = get_app_data_dir()?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("accounts.json"))
}

/// 获取.codex/auth.json路径
fn get_codex_auth_path() -> Result<PathBuf, String> {
    dirs::home_dir()
        .map(|p| p.join(".codex").join("auth.json"))
        .ok_or_else(|| "Cannot find home directory".to_string())
}

/// 获取账号 auth 存储目录
fn get_auth_store_dir() -> Result<PathBuf, String> {
    let dir = get_codex_manager_dir()?.join("auths");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// 获取指定账号 auth 文件路径
fn get_account_auth_path(account_id: &str) -> Result<PathBuf, String> {
    let dir = get_auth_store_dir()?;
    Ok(dir.join(format!("{}.json", account_id)))
}

#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct TrayLimitSummary {
    percent_left: f64,
    reset_time: String,
}

#[derive(Debug, Deserialize, Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
struct TrayContextWindowSummary {
    percent_left: f64,
    used: String,
    total: String,
}

#[derive(Debug, Deserialize, Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
struct TrayUsageSummary {
    status: Option<String>,
    message: Option<String>,
    plan_type: Option<String>,
    context_window: Option<TrayContextWindowSummary>,
    five_hour_limit: Option<TrayLimitSummary>,
    weekly_limit: Option<TrayLimitSummary>,
    code_review_limit: Option<TrayLimitSummary>,
    last_updated: Option<String>,
    source_file: Option<String>,
}

#[derive(Debug, Deserialize, Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
struct TrayOrganization {
    id: String,
    title: String,
    role: String,
    is_default: Option<bool>,
}

#[derive(Debug, Deserialize, Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
struct TrayAccountInfo {
    email: String,
    plan_type: String,
    account_id: Option<String>,
    user_id: Option<String>,
    account_user_id: Option<String>,
    account_structure: Option<String>,
    workspace_name: Option<String>,
    subscription_active_until: Option<String>,
    organizations: Option<Vec<TrayOrganization>>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct TrayStoredAccount {
    id: String,
    alias: String,
    account_info: TrayAccountInfo,
    usage_info: Option<TrayUsageSummary>,
    is_active: bool,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct TrayAppConfig {
    auto_refresh_interval: Option<u64>,
    codex_path: Option<String>,
    close_behavior: Option<String>,
    theme: Option<String>,
    has_initialized: Option<bool>,
    proxy_enabled: Option<bool>,
    proxy_url: Option<String>,
    auto_restart_codex_on_switch: Option<bool>,
    skip_switch_restart_confirm: Option<bool>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct TrayAccountsStore {
    version: String,
    accounts: Vec<TrayStoredAccount>,
    config: TrayAppConfig,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct TrayAccountSwitchedPayload {
    account_id: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct BackgroundUsageRefreshedPayload {
    updated_count: usize,
    finished_at: String,
}

/// 加载账号存储数据
#[tauri::command]
fn load_accounts_store() -> Result<String, String> {
    let path = get_accounts_store_path()?;

    if !path.exists() {
        return Err("Store file not found".to_string());
    }

    fs::read_to_string(&path).map_err(|e| e.to_string())
}

/// 保存账号存储数据
#[tauri::command]
fn save_accounts_store(data: String) -> Result<(), String> {
    let path = get_accounts_store_path()?;
    fs::write(&path, data).map_err(|e| e.to_string())
}

fn load_accounts_store_data() -> Result<TrayAccountsStore, String> {
    let path = get_accounts_store_path()?;

    if !path.exists() {
        return Ok(TrayAccountsStore {
            version: "1.0.0".to_string(),
            accounts: Vec::new(),
            config: TrayAppConfig {
                auto_refresh_interval: Some(30),
                codex_path: Some("codex".to_string()),
                close_behavior: Some("ask".to_string()),
                theme: Some("dark".to_string()),
                has_initialized: Some(false),
                proxy_enabled: Some(false),
                proxy_url: Some("http://127.0.0.1:7890".to_string()),
                auto_restart_codex_on_switch: Some(false),
                skip_switch_restart_confirm: Some(false),
            },
        });
    }

    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&content).map_err(|e| e.to_string())
}

fn save_accounts_store_data(store: &TrayAccountsStore) -> Result<(), String> {
    let data = serde_json::to_string_pretty(store).map_err(|e| e.to_string())?;
    save_accounts_store(data)
}

fn persist_current_auth_to_matching_account() -> Result<(), String> {
    let current_auth_json = match read_codex_auth() {
        Ok(auth_json) => auth_json,
        Err(_) => return Ok(()),
    };

    let current_auth: AuthConfig =
        serde_json::from_str(&current_auth_json).map_err(|e| e.to_string())?;
    let current_chatgpt_account_id = current_auth
        .tokens
        .as_ref()
        .and_then(|tokens| tokens.account_id.as_deref())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string);

    let Some(current_chatgpt_account_id) = current_chatgpt_account_id else {
        return Ok(());
    };

    let store = load_accounts_store_data()?;
    if let Some(account) = store.accounts.iter().find(|account| {
        account.account_info.account_id.as_deref() == Some(current_chatgpt_account_id.as_str())
    }) {
        save_account_auth(account.id.clone(), current_auth_json)?;
    }

    Ok(())
}

fn normalize_tray_close_behavior(value: Option<&str>) -> &'static str {
    match value.unwrap_or_default() {
        "exit" => "exit",
        "tray" => "tray",
        _ => "ask",
    }
}

fn format_tray_percent(limit: Option<&TrayLimitSummary>, label: &str) -> String {
    match limit {
        Some(limit) => format!("{} {:.0}%", label, limit.percent_left),
        None => format!("{} --", label),
    }
}

fn format_usage_reset_time(reset_time_ms: i64, include_weekday: bool) -> Result<String, String> {
    if reset_time_ms <= 0 {
        return Err("Invalid reset timestamp".to_string());
    }

    let date_time = Local
        .timestamp_millis_opt(reset_time_ms)
        .single()
        .ok_or_else(|| "Invalid reset timestamp".to_string())?;

    if include_weekday {
        Ok(date_time.format("%m-%d %H:%M").to_string())
    } else {
        Ok(date_time.format("%H:%M").to_string())
    }
}

fn build_tray_usage_summary(result: &UsageResult) -> TrayUsageSummary {
    let mut summary = TrayUsageSummary {
        status: Some(result.status.clone()),
        message: result.message.clone(),
        plan_type: result.plan_type.clone(),
        context_window: None,
        five_hour_limit: None,
        weekly_limit: None,
        code_review_limit: None,
        last_updated: Some(now_epoch_ms_string()),
        source_file: result
            .usage
            .as_ref()
            .and_then(|usage| usage.source_file.clone()),
    };

    if let Some(usage) = &result.usage {
        summary.last_updated = Some(usage.last_updated.clone());

        if let (Some(percent_left), Some(reset_time_ms)) =
            (usage.five_hour_percent_left, usage.five_hour_reset_time_ms)
        {
            if let Ok(reset_time) = format_usage_reset_time(reset_time_ms, false) {
                summary.five_hour_limit = Some(TrayLimitSummary {
                    percent_left: percent_left.round(),
                    reset_time,
                });
            }
        }

        if let (Some(percent_left), Some(reset_time_ms)) =
            (usage.weekly_percent_left, usage.weekly_reset_time_ms)
        {
            if let Ok(reset_time) = format_usage_reset_time(reset_time_ms, true) {
                summary.weekly_limit = Some(TrayLimitSummary {
                    percent_left: percent_left.round(),
                    reset_time,
                });
            }
        }

        if let (Some(percent_left), Some(reset_time_ms)) = (
            usage.code_review_percent_left,
            usage.code_review_reset_time_ms,
        ) {
            if let Ok(reset_time) = format_usage_reset_time(reset_time_ms, false) {
                summary.code_review_limit = Some(TrayLimitSummary {
                    percent_left: percent_left.round(),
                    reset_time,
                });
            }
        }
    }

    summary
}

fn normalize_tray_text(value: Option<&str>) -> Option<String> {
    let trimmed = value.unwrap_or_default().trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

fn format_tray_expiry(value: Option<&str>) -> String {
    let Some(value) = normalize_tray_text(value) else {
        return "到期 --".to_string();
    };

    if let Some((date, _)) = value.split_once('T') {
        return format!("到期 {}", date);
    }

    if value.len() >= 10 {
        return format!("到期 {}", &value[..10]);
    }

    format!("到期 {}", value)
}

fn build_tray_account_title(account: &TrayStoredAccount) -> String {
    let email = normalize_tray_text(Some(&account.account_info.email))
        .or_else(|| normalize_tray_text(Some(&account.alias)))
        .unwrap_or_else(|| "未命名账号".to_string());

    let workspace_name = normalize_tray_text(account.account_info.workspace_name.as_deref())
        .filter(|value| value != &email);

    match workspace_name {
        Some(workspace_name) => format!("{} / {}", email, workspace_name),
        None => email,
    }
}

fn build_tray_account_detail(account: &TrayStoredAccount) -> String {
    let usage = account.usage_info.as_ref();
    let mut parts = Vec::new();
    if let Some(five_hour_limit) = usage.and_then(|current| current.five_hour_limit.as_ref()) {
        parts.push(format_tray_percent(Some(five_hour_limit), "5H"));
    }
    if let Some(weekly_limit) = usage.and_then(|current| current.weekly_limit.as_ref()) {
        parts.push(format_tray_percent(Some(weekly_limit), "周"));
    }
    let code_review = format_tray_percent(
        usage.and_then(|current| current.code_review_limit.as_ref()),
        "审查",
    );
    let expiry = format_tray_expiry(account.account_info.subscription_active_until.as_deref());

    parts.push(code_review);
    parts.push(expiry);
    parts.join("  ")
}

fn show_main_window_internal<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "主窗口不存在".to_string())?;
    let _ = window.unminimize();
    let _ = window.show();
    let _ = window.set_focus();
    Ok(())
}

fn hide_to_tray_internal<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "主窗口不存在".to_string())?;
    window.hide().map_err(|e| e.to_string())
}

fn switch_account_from_tray<R: Runtime>(
    app: &AppHandle<R>,
    account_id: &str,
) -> Result<(), String> {
    persist_current_auth_to_matching_account()?;

    let auth_json = read_account_auth(account_id.to_string())?;
    write_codex_auth(auth_json)?;

    let mut store = load_accounts_store_data()?;
    let mut matched = false;
    let now = now_epoch_ms_string();

    for account in store.accounts.iter_mut() {
        let is_target = account.id == account_id;
        if is_target {
            matched = true;
            account.updated_at = now.clone();
        }
        account.is_active = is_target;
    }

    if !matched {
        return Err("\u{76ee}\u{6807}\u{8d26}\u{53f7}\u{4e0d}\u{5b58}\u{5728}".to_string());
    }

    save_accounts_store_data(&store)?;
    let _ = refresh_tray_menu_internal(app);

    if let Some(window) = app.get_webview_window("main") {
        let _ = window.emit(
            "tray-account-switched",
            TrayAccountSwitchedPayload {
                account_id: account_id.to_string(),
            },
        );
    }

    Ok(())
}

fn build_tray_menu<R: Runtime>(app: &AppHandle<R>) -> Result<Menu<R>, String> {
    let store = load_accounts_store_data()?;
    let menu = Menu::new(app).map_err(|e| e.to_string())?;

    let open_item = MenuItem::with_id(app, TRAY_MENU_OPEN_ID, "打开主界面", true, None::<&str>)
        .map_err(|e| e.to_string())?;
    menu.append(&open_item).map_err(|e| e.to_string())?;

    let separator = PredefinedMenuItem::separator(app).map_err(|e| e.to_string())?;
    menu.append(&separator).map_err(|e| e.to_string())?;

    if store.accounts.is_empty() {
        let empty_item = MenuItem::with_id(
            app,
            "tray-empty",
            "暂无账号，请先在主界面导入",
            false,
            None::<&str>,
        )
        .map_err(|e| e.to_string())?;
        menu.append(&empty_item).map_err(|e| e.to_string())?;
    } else {
        for account in &store.accounts {
            let account_item = CheckMenuItem::with_id(
                app,
                format!("account:{}", account.id),
                build_tray_account_title(account),
                true,
                account.is_active,
                None::<&str>,
            )
            .map_err(|e| e.to_string())?;
            menu.append(&account_item).map_err(|e| e.to_string())?;

            let detail_item = MenuItem::with_id(
                app,
                format!("account-detail:{}", account.id),
                build_tray_account_detail(account),
                false,
                None::<&str>,
            )
            .map_err(|e| e.to_string())?;
            menu.append(&detail_item).map_err(|e| e.to_string())?;

            let account_separator =
                PredefinedMenuItem::separator(app).map_err(|e| e.to_string())?;
            menu.append(&account_separator).map_err(|e| e.to_string())?;
        }
    }

    let close_behavior_item = MenuItem::with_id(
        app,
        "tray-close-behavior",
        format!(
            "关闭按钮：{}",
            match normalize_tray_close_behavior(store.config.close_behavior.as_deref()) {
                "exit" => "直接退出",
                "tray" => "最小化到托盘",
                _ => "每次询问",
            }
        ),
        false,
        None::<&str>,
    )
    .map_err(|e| e.to_string())?;
    menu.append(&close_behavior_item)
        .map_err(|e| e.to_string())?;

    let exit_separator = PredefinedMenuItem::separator(app).map_err(|e| e.to_string())?;
    menu.append(&exit_separator).map_err(|e| e.to_string())?;

    let exit_item = MenuItem::with_id(app, TRAY_MENU_EXIT_ID, "退出", true, None::<&str>)
        .map_err(|e| e.to_string())?;
    menu.append(&exit_item).map_err(|e| e.to_string())?;

    Ok(menu)
}

fn refresh_tray_menu_internal<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let tray = app
        .tray_by_id(TRAY_ID)
        .ok_or_else(|| "托盘图标不存在".to_string())?;
    let menu = build_tray_menu(app)?;
    tray.set_menu(Some(menu)).map_err(|e| e.to_string())
}

fn now_epoch_ms_u64() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or_default()
}

fn should_run_background_auto_refresh(
    interval_minutes: u64,
    last_refresh_ms: u64,
    current_ms: u64,
) -> bool {
    if interval_minutes == 0 {
        return false;
    }

    if last_refresh_ms == 0 {
        return true;
    }

    let interval_ms = interval_minutes.saturating_mul(60_000);
    current_ms.saturating_sub(last_refresh_ms) >= interval_ms
}

async fn refresh_accounts_usage_in_background<R: Runtime>(
    app: &AppHandle<R>,
) -> Result<usize, String> {
    let store = load_accounts_store_data()?;
    if store.accounts.is_empty() {
        return Ok(0);
    }

    let proxy_enabled = store.config.proxy_enabled;
    let proxy_url = store.config.proxy_url.clone();
    let mut updated_count = 0usize;
    let mut usage_updates: HashMap<String, TrayUsageSummary> = HashMap::new();

    for account in &store.accounts {
        let result = match get_codex_wham_usage(
            account.id.clone(),
            proxy_enabled,
            proxy_url.clone(),
        )
        .await
        {
            Ok(result) => result,
            Err(error) => UsageResult {
                status: "error".to_string(),
                message: Some(error),
                plan_type: None,
                usage: None,
            },
        };

        if result.status == "ok" {
            updated_count += 1;
        }

        usage_updates.insert(account.id.clone(), build_tray_usage_summary(&result));
    }

    let mut latest_store = load_accounts_store_data()?;
    let mut changed = false;
    for account in latest_store.accounts.iter_mut() {
        if let Some(summary) = usage_updates.get(&account.id) {
            account.usage_info = Some(summary.clone());
            changed = true;
        }
    }

    if changed {
        save_accounts_store_data(&latest_store)?;
    }
    refresh_tray_menu_internal(app)?;

    if let Some(window) = app.get_webview_window("main") {
        let _ = window.emit(
            "background-usage-refreshed",
            BackgroundUsageRefreshedPayload {
                updated_count,
                finished_at: now_epoch_ms_string(),
            },
        );
    }

    Ok(updated_count)
}

async fn maybe_run_background_auto_refresh<R: Runtime>(app: &AppHandle<R>) {
    if AUTO_REFRESH_RUNNING.swap(true, Ordering::SeqCst) {
        return;
    }

    let result = async {
        let store = load_accounts_store_data()?;
        let interval_minutes = store.config.auto_refresh_interval.unwrap_or(30);
        if interval_minutes == 0 || store.accounts.is_empty() {
            return Ok::<(), String>(());
        }

        let current_ms = now_epoch_ms_u64();
        let last_refresh_ms = {
            let guard = LAST_AUTO_REFRESH_MS
                .lock()
                .map_err(|_| "自动刷新状态锁不可用".to_string())?;
            *guard
        };

        if !should_run_background_auto_refresh(interval_minutes, last_refresh_ms, current_ms) {
            return Ok(());
        }

        refresh_accounts_usage_in_background(app).await?;

        let mut guard = LAST_AUTO_REFRESH_MS
            .lock()
            .map_err(|_| "自动刷新状态锁不可用".to_string())?;
        *guard = current_ms;
        Ok(())
    }
    .await;

    if let Err(error) = result {
        log::warn!("后台自动刷新失败: {}", error);
    }

    AUTO_REFRESH_RUNNING.store(false, Ordering::SeqCst);
}

fn start_background_auto_refresh<R: Runtime>(app: &AppHandle<R>) {
    let app_handle = app.clone();
    tauri::async_runtime::spawn(async move {
        loop {
            maybe_run_background_auto_refresh(&app_handle).await;
            tokio::time::sleep(Duration::from_secs(30)).await;
        }
    });
}

/// 写入Codex auth.json
#[tauri::command]
fn write_codex_auth(auth_config: String) -> Result<(), String> {
    let path = get_codex_auth_path()?;

    // 确保.codex目录存在
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    fs::write(&path, auth_config).map_err(|e| e.to_string())
}

/// 读取当前Codex auth.json
#[tauri::command]
fn read_codex_auth() -> Result<String, String> {
    let path = get_codex_auth_path()?;

    if !path.exists() {
        return Err("Codex auth.json not found".to_string());
    }

    fs::read_to_string(&path).map_err(|e| e.to_string())
}

/// 保存指定账号 auth
#[tauri::command]
fn save_account_auth(account_id: String, auth_config: String) -> Result<(), String> {
    let path = get_account_auth_path(&account_id)?;
    fs::write(&path, auth_config).map_err(|e| e.to_string())
}

/// 读取指定账号 auth
#[tauri::command]
fn read_account_auth(account_id: String) -> Result<String, String> {
    let path = get_account_auth_path(&account_id)?;
    if !path.exists() {
        return Err("Account auth not found".to_string());
    }
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

/// 删除指定账号 auth
#[tauri::command]
fn delete_account_auth(account_id: String) -> Result<(), String> {
    let path = get_account_auth_path(&account_id)?;
    if path.exists() {
        fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// 读取文件内容
#[tauri::command]
fn read_file_content(file_path: String) -> Result<String, String> {
    fs::read_to_string(&file_path).map_err(|e| e.to_string())
}

/// 写入文件内容
#[tauri::command]
fn write_file_content(file_path: String, content: String) -> Result<(), String> {
    let path = PathBuf::from(file_path);

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    fs::write(path, content).map_err(|e| e.to_string())
}

/// 获取用户主目录
#[tauri::command]
fn get_home_dir() -> Result<String, String> {
    dirs::home_dir()
        .map(|p| p.to_string_lossy().to_string())
        .ok_or_else(|| "Cannot find home directory".to_string())
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct RestartCodexProcessesResult {
    app_restarted: bool,
    cli_restarted: bool,
}

#[cfg(windows)]
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WindowsRestartCodexResult {
    app_restarted: bool,
    cli_restarted: bool,
}

#[cfg(windows)]
fn escape_powershell_single_quoted(value: &str) -> String {
    value.replace('\'', "''")
}

#[cfg(windows)]
fn build_codex_cli_launch_command(codex_path: Option<String>) -> String {
    let normalized = normalize_codex_command_input(codex_path);
    format!("& '{}'", escape_powershell_single_quoted(&normalized))
}

#[cfg(windows)]
fn run_windows_powershell(script: &str) -> Result<String, String> {
    let output = std::process::Command::new("powershell.exe")
        .args([
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            script,
        ])
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        if stderr.is_empty() {
            return Err(format!("PowerShell exited with status {}", output.status));
        }
        return Err(stderr);
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

#[cfg(windows)]
fn restart_codex_processes_windows(
    codex_path: Option<String>,
) -> Result<RestartCodexProcessesResult, String> {
    let launch_command =
        escape_powershell_single_quoted(&build_codex_cli_launch_command(codex_path));

    let script = format!(
        r#"
$ErrorActionPreference = 'Stop'

function Resolve-ExecutablePath([string]$commandLine) {{
    if (-not $commandLine) {{
        return $null
    }}

    if ($commandLine -match '^\s*"([^"]+)"') {{
        return $Matches[1]
    }}

    if ($commandLine -match '^\s*([^\s]+)') {{
        return $Matches[1]
    }}

    return $null
}}

$desktopProcesses = @(
    Get-CimInstance Win32_Process | Where-Object {{
        $_.CommandLine -and (
            ($_.Name -ieq 'Codex.exe' -and $_.CommandLine -match 'OpenAI\.Codex') -or
            ($_.Name -ieq 'codex.exe' -and $_.CommandLine -match '\\app\\resources\\codex\.exe')
        )
    }}
)

$desktopMain = $desktopProcesses |
    Where-Object {{ $_.Name -ieq 'Codex.exe' -and $_.CommandLine -notmatch '--type=' }} |
    Select-Object -First 1

if (-not $desktopMain) {{
    $desktopMain = $desktopProcesses | Select-Object -First 1
}}

$appExecutablePath = $null
if ($desktopMain) {{
    $appExecutablePath = $desktopMain.ExecutablePath
    if (-not $appExecutablePath) {{
        $appExecutablePath = Resolve-ExecutablePath $desktopMain.CommandLine
    }}
}}

foreach ($process in $desktopProcesses) {{
    Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
}}

$appRestarted = $false
if ($desktopProcesses.Count -gt 0 -and $appExecutablePath) {{
    Start-Sleep -Milliseconds 700
    Start-Process -FilePath $appExecutablePath | Out-Null
    $appRestarted = $true
}}

$cliProcesses = @(
    Get-CimInstance Win32_Process | Where-Object {{
        $_.CommandLine -and
        $_.CommandLine -notmatch 'codex-auth-manager' -and
        $_.CommandLine -notmatch 'OpenAI\.Codex' -and
        $_.CommandLine -notmatch '\\app\\resources\\codex\.exe' -and
        (
            ((@('powershell.exe', 'pwsh.exe', 'cmd.exe') -contains $_.Name.ToLower()) -and $_.CommandLine -match '(^|[\s"''`])codex([\s"''`]|$)') -or
            ((@('node.exe', 'codex.exe') -contains $_.Name.ToLower()) -and $_.CommandLine -match 'codex')
        )
    }}
)

foreach ($process in $cliProcesses) {{
    Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
}}

$cliRestarted = $false
if ($cliProcesses.Count -gt 0) {{
    Start-Sleep -Milliseconds 400
    $launchCommand = '{}'
    Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoExit', '-Command', $launchCommand) | Out-Null
    $cliRestarted = $true
}}

[pscustomobject]@{{
    appRestarted = $appRestarted
    cliRestarted = $cliRestarted
}} | ConvertTo-Json -Compress
"#,
        launch_command
    );

    let stdout = run_windows_powershell(&script)?;
    let result: WindowsRestartCodexResult =
        serde_json::from_str(stdout.trim()).map_err(|e| e.to_string())?;

    Ok(RestartCodexProcessesResult {
        app_restarted: result.app_restarted,
        cli_restarted: result.cli_restarted,
    })
}

#[tauri::command]
fn restart_codex_processes(
    codex_path: Option<String>,
) -> Result<RestartCodexProcessesResult, String> {
    #[cfg(windows)]
    {
        restart_codex_processes_windows(codex_path)
    }

    #[cfg(not(windows))]
    {
        let _ = codex_path;
        Err("Restarting Codex processes is only supported on Windows".to_string())
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct StartCodexLoginResult {
    status: String,
    auth_json: Option<String>,
    changed_at: Option<String>,
    message: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum LoginCommandMode {
    Direct,
    Cmd,
    PowerShell,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct LoginInvocation {
    program: String,
    args: Vec<String>,
    mode: LoginCommandMode,
}

#[derive(Debug, Clone)]
struct AuthSnapshot {
    modified: Option<SystemTime>,
    content: Option<String>,
}

fn get_auth_snapshot(path: &Path) -> Result<AuthSnapshot, String> {
    if !path.exists() {
        return Ok(AuthSnapshot {
            modified: None,
            content: None,
        });
    }

    let modified = fs::metadata(path).and_then(|meta| meta.modified()).ok();
    let content = fs::read_to_string(path).ok();

    Ok(AuthSnapshot { modified, content })
}

fn auth_snapshot_changed(previous: &AuthSnapshot, current: &AuthSnapshot) -> bool {
    if previous.modified != current.modified {
        return true;
    }
    previous.content != current.content
}

fn validate_login_auth_json(auth_json: &str) -> Result<(), String> {
    let auth: AuthConfig = serde_json::from_str(auth_json).map_err(|e| e.to_string())?;
    let tokens = auth
        .tokens
        .ok_or_else(|| "auth.json \u{7f3a}\u{5c11} tokens \u{5b57}\u{6bb5}".to_string())?;

    take_non_empty_token(tokens.id_token, "auth.json \u{7f3a}\u{5c11} id_token")?;
    take_non_empty_token(
        tokens.access_token,
        "auth.json \u{7f3a}\u{5c11} access_token",
    )?;
    take_non_empty_token(
        tokens.refresh_token,
        "auth.json \u{7f3a}\u{5c11} refresh_token",
    )?;
    take_non_empty_token(tokens.account_id, "auth.json \u{7f3a}\u{5c11} account_id")?;

    Ok(())
}

fn normalize_codex_command_input(codex_path: Option<String>) -> String {
    let value = codex_path.unwrap_or_default();
    let trimmed = value.trim();
    let normalized = match trimmed.as_bytes() {
        [first, middle @ .., last]
            if (*first == b'"' && *last == b'"') || (*first == b'\'' && *last == b'\'') =>
        {
            std::str::from_utf8(middle).unwrap_or(trimmed).trim()
        }
        _ => trimmed,
    };

    if normalized.is_empty() {
        "codex".to_string()
    } else {
        normalized.to_string()
    }
}

#[cfg(windows)]
fn resolve_command_candidates(command: &str) -> Vec<String> {
    if command.contains('\\') || command.contains('/') || command.contains(':') {
        return vec![command.to_string()];
    }

    let output = std::process::Command::new("where.exe")
        .arg(command)
        .output();
    let Ok(output) = output else {
        return vec![command.to_string()];
    };

    if !output.status.success() {
        return vec![command.to_string()];
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut candidates: Vec<String> = stdout
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(|line| line.to_string())
        .collect();

    if candidates.is_empty() {
        candidates.push(command.to_string());
    }

    candidates
}

#[cfg(not(windows))]
fn resolve_command_candidates(command: &str) -> Vec<String> {
    vec![command.to_string()]
}

fn command_priority(candidate: &str) -> usize {
    let lower = candidate.to_ascii_lowercase();
    if lower.ends_with(".cmd") || lower.ends_with(".bat") || lower.ends_with(".com") {
        0
    } else if lower.ends_with(".exe") {
        1
    } else if lower.ends_with(".ps1") {
        2
    } else {
        3
    }
}

fn resolve_login_invocation(codex_path: Option<String>) -> Result<LoginInvocation, String> {
    let requested = normalize_codex_command_input(codex_path);
    let mut candidates = resolve_command_candidates(&requested);
    candidates.sort_by_key(|candidate| command_priority(candidate));

    let selected = candidates
        .first()
        .cloned()
        .ok_or_else(|| "未找到可用的 codex 命令".to_string())?;
    let selected_path = PathBuf::from(&selected);
    let lower = selected.to_ascii_lowercase();

    if lower.ends_with(".ps1") {
        return Ok(LoginInvocation {
            program: "powershell".to_string(),
            args: vec![
                "-NoLogo".to_string(),
                "-NoProfile".to_string(),
                "-ExecutionPolicy".to_string(),
                "Bypass".to_string(),
                "-File".to_string(),
                selected,
                "login".to_string(),
            ],
            mode: LoginCommandMode::PowerShell,
        });
    }

    if lower.ends_with(".cmd") || lower.ends_with(".bat") {
        return Ok(LoginInvocation {
            program: "cmd".to_string(),
            args: vec!["/C".to_string(), selected, "login".to_string()],
            mode: LoginCommandMode::Cmd,
        });
    }

    if selected_path.is_absolute() || selected.contains('\\') || selected.contains('/') {
        return Ok(LoginInvocation {
            program: selected,
            args: vec!["login".to_string()],
            mode: LoginCommandMode::Direct,
        });
    }

    Ok(LoginInvocation {
        program: selected,
        args: vec!["login".to_string()],
        mode: LoginCommandMode::Direct,
    })
}

fn build_login_command(invocation: &LoginInvocation) -> Command {
    let mut command = Command::new(&invocation.program);
    command.args(&invocation.args);
    command.stdin(std::process::Stdio::null());
    command.stdout(std::process::Stdio::null());
    command.stderr(std::process::Stdio::null());

    #[cfg(windows)]
    command.creation_flags(CREATE_NO_WINDOW);

    command
}

fn normalize_login_timeout_seconds(timeout_seconds: Option<u64>) -> u64 {
    match timeout_seconds {
        Some(0) | None => DEFAULT_LOGIN_TIMEOUT_SECONDS,
        Some(value) => value.max(30),
    }
}

async fn terminate_login_process(child: &mut Child) {
    if child.try_wait().ok().flatten().is_none() {
        let _ = child.kill().await;
    }
}

fn build_login_success_result(auth_json: String, changed_at: String) -> StartCodexLoginResult {
    StartCodexLoginResult {
        status: "success".to_string(),
        auth_json: Some(auth_json),
        changed_at: Some(changed_at),
        message: None,
    }
}

fn build_login_error_result(status: &str, message: impl Into<String>) -> StartCodexLoginResult {
    StartCodexLoginResult {
        status: status.to_string(),
        auth_json: None,
        changed_at: None,
        message: Some(message.into()),
    }
}

fn try_read_updated_auth(
    auth_path: &Path,
    baseline: &AuthSnapshot,
) -> Result<Option<StartCodexLoginResult>, String> {
    let current = get_auth_snapshot(auth_path)?;
    if !auth_snapshot_changed(baseline, &current) {
        return Ok(None);
    }

    let Some(content) = current.content else {
        return Ok(None);
    };

    match validate_login_auth_json(&content) {
        Ok(()) => {
            let changed_at = current
                .modified
                .and_then(epoch_ms_from_system_time)
                .map(|value| value.to_string())
                .unwrap_or_else(now_epoch_ms_string);
            Ok(Some(build_login_success_result(content, changed_at)))
        }
        Err(_) => Ok(None),
    }
}

#[tauri::command]
async fn start_codex_login(
    codex_path: Option<String>,
    timeout_seconds: Option<u64>,
) -> Result<StartCodexLoginResult, String> {
    LOGIN_CANCEL_REQUESTED.store(false, Ordering::SeqCst);
    let auth_path = get_codex_auth_path()?;
    let baseline = get_auth_snapshot(&auth_path)?;
    let invocation = resolve_login_invocation(codex_path)?;
    let timeout = Duration::from_secs(normalize_login_timeout_seconds(timeout_seconds));

    let mut child = build_login_command(&invocation).spawn().map_err(|error| {
        if error.kind() == std::io::ErrorKind::NotFound {
            format!(
                "未找到 Codex CLI，请检查设置中的命令路径：{}",
                invocation.program
            )
        } else {
            format!("启动 Codex 登录失败：{}", error)
        }
    })?;

    let started_at = Instant::now();
    loop {
        if LOGIN_CANCEL_REQUESTED.load(Ordering::SeqCst) {
            terminate_login_process(&mut child).await;
            LOGIN_CANCEL_REQUESTED.store(false, Ordering::SeqCst);
            return Ok(build_login_error_result(
                "cancelled",
                "已取消快速登录，停止等待授权".to_string(),
            ));
        }

        if let Some(result) = try_read_updated_auth(&auth_path, &baseline)? {
            terminate_login_process(&mut child).await;
            LOGIN_CANCEL_REQUESTED.store(false, Ordering::SeqCst);
            return Ok(result);
        }

        if let Some(status) = child.try_wait().map_err(|e| e.to_string())? {
            if let Some(result) = try_read_updated_auth(&auth_path, &baseline)? {
                LOGIN_CANCEL_REQUESTED.store(false, Ordering::SeqCst);
                return Ok(result);
            }

            let message = if status.success() {
                "Codex 登录进程已结束，但未检测到新的 auth.json".to_string()
            } else {
                match status.code() {
                    Some(code) => format!("Codex 登录进程异常结束，退出码：{}", code),
                    None => "Codex 登录进程已被终止".to_string(),
                }
            };

            LOGIN_CANCEL_REQUESTED.store(false, Ordering::SeqCst);
            return Ok(build_login_error_result("process_error", message));
        }

        if started_at.elapsed() >= timeout {
            terminate_login_process(&mut child).await;
            LOGIN_CANCEL_REQUESTED.store(false, Ordering::SeqCst);
            return Ok(build_login_error_result(
                "timeout",
                format!(
                    "在 {} 秒内未检测到新的 auth.json，请完成浏览器授权后重试",
                    timeout.as_secs()
                ),
            ));
        }

        tokio::time::sleep(Duration::from_millis(1000)).await;
    }
}

#[tauri::command]
fn cancel_codex_login() -> Result<(), String> {
    LOGIN_CANCEL_REQUESTED.store(true, Ordering::SeqCst);
    Ok(())
}

#[tauri::command]
fn refresh_tray_menu(app: AppHandle) -> Result<(), String> {
    refresh_tray_menu_internal(&app)
}

#[tauri::command]
fn show_main_window(app: AppHandle) -> Result<(), String> {
    show_main_window_internal(&app)
}

#[tauri::command]
fn hide_to_tray(app: AppHandle) -> Result<(), String> {
    hide_to_tray_internal(&app)
}

#[tauri::command]
fn exit_application(app: AppHandle) -> Result<(), String> {
    app.exit(0);
    Ok(())
}

fn initialize_tray<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let menu = build_tray_menu(app)?;
    let mut tray_builder = TrayIconBuilder::with_id(TRAY_ID)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| {
            let menu_id = event.id.as_ref();
            if menu_id == TRAY_MENU_OPEN_ID {
                let _ = show_main_window_internal(app);
                return;
            }
            if menu_id == TRAY_MENU_EXIT_ID {
                app.exit(0);
                return;
            }
            if let Some(account_id) = menu_id.strip_prefix("account:") {
                let _ = switch_account_from_tray(app, account_id);
            }
        })
        .on_tray_icon_event(|tray, event| {
            if matches!(
                event,
                TrayIconEvent::Click {
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Up,
                    ..
                } | TrayIconEvent::DoubleClick {
                    button: MouseButton::Left,
                    ..
                }
            ) {
                let _ = show_main_window_internal(tray.app_handle());
            }
        });

    if let Some(icon) = app.default_window_icon().cloned() {
        tray_builder = tray_builder.icon(icon);
    }

    tray_builder.build(app).map_err(|e| e.to_string())?;
    Ok(())
}

/// 获取用量绑定映射路径
fn get_usage_bindings_path() -> Result<PathBuf, String> {
    let dir = get_app_data_dir()?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("usage-bindings.json"))
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct SessionBinding {
    session_id: String,
    created_at: String,
    file_path: String,
    bound_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct UsageBindingsStore {
    version: String,
    bindings: HashMap<String, Vec<SessionBinding>>,
}

fn load_usage_bindings_unlocked() -> Result<UsageBindingsStore, String> {
    let path = get_usage_bindings_path()?;
    if !path.exists() {
        return Ok(UsageBindingsStore {
            version: "1.0.0".to_string(),
            bindings: HashMap::new(),
        });
    }
    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let store: UsageBindingsStore = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    Ok(store)
}

fn save_usage_bindings_unlocked(store: &UsageBindingsStore) -> Result<(), String> {
    let path = get_usage_bindings_path()?;
    let data = serde_json::to_string_pretty(store).map_err(|e| e.to_string())?;
    fs::write(&path, data).map_err(|e| e.to_string())
}

fn update_usage_bindings(account_id: &str, binding: SessionBinding) -> Result<(), String> {
    let _guard = USAGE_BINDINGS_LOCK
        .lock()
        .map_err(|_| "Bindings lock poisoned".to_string())?;
    let mut store = load_usage_bindings_unlocked()?;
    for (existing_account, existing_entries) in store.bindings.iter() {
        if existing_account == account_id {
            continue;
        }
        if existing_entries
            .iter()
            .any(|b| b.session_id == binding.session_id || b.file_path == binding.file_path)
        {
            return Err("Session file already bound to another account".to_string());
        }
    }
    let entries = store.bindings.entry(account_id.to_string()).or_default();
    if let Some(existing) = entries
        .iter_mut()
        .find(|b| b.session_id == binding.session_id)
    {
        *existing = binding;
    } else {
        entries.push(binding);
    }
    entries.sort_by(|a, b| {
        a.created_at
            .cmp(&b.created_at)
            .then(a.bound_at.cmp(&b.bound_at))
    });
    if entries.len() > 200 {
        let start = entries.len().saturating_sub(200);
        entries.drain(0..start);
    }
    save_usage_bindings_unlocked(&store)
}

fn get_latest_bound_session_path(account_id: &str) -> Result<PathBuf, String> {
    let _guard = USAGE_BINDINGS_LOCK
        .lock()
        .map_err(|_| "Bindings lock poisoned".to_string())?;
    let store = load_usage_bindings_unlocked()?;
    let entries = store
        .bindings
        .get(account_id)
        .ok_or_else(|| "No usage bindings found for account".to_string())?;

    let mut best_path: Option<PathBuf> = None;
    let mut best_mtime: Option<SystemTime> = None;

    for entry in entries.iter().rev() {
        let path = PathBuf::from(&entry.file_path);
        if !path.exists() {
            continue;
        }
        let mtime = fs::metadata(&path)
            .and_then(|m| m.modified())
            .unwrap_or(UNIX_EPOCH);
        if best_mtime.map_or(true, |current| mtime > current) {
            best_mtime = Some(mtime);
            best_path = Some(path);
        }
    }

    best_path.ok_or_else(|| "No valid bound session files found".to_string())
}

#[derive(Debug, Deserialize)]
struct AuthTokens {
    id_token: Option<String>,
    access_token: Option<String>,
    refresh_token: Option<String>,
    account_id: Option<String>,
}

#[derive(Debug, Deserialize)]
struct AuthConfig {
    tokens: Option<AuthTokens>,
}

#[derive(Debug, Deserialize)]
struct WhamAccountsCheckResponse {
    accounts: Vec<WhamAccountEntry>,
}

#[derive(Debug, Deserialize)]
struct WhamAccountEntry {
    id: String,
    account_user_id: Option<String>,
    structure: Option<String>,
    plan_type: Option<String>,
    name: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct WhamAccountMetadata {
    workspace_name: Option<String>,
    account_user_id: Option<String>,
    account_structure: Option<String>,
    plan_type: Option<String>,
}

fn build_http_client(
    proxy_enabled: Option<bool>,
    proxy_url: Option<String>,
) -> Result<Client, String> {
    let mut client_builder = Client::builder();
    if proxy_enabled.unwrap_or(false) {
        let proxy_value = proxy_url.unwrap_or_default();
        if proxy_value.trim().is_empty() {
            return Err("\u{4ee3}\u{7406}\u{5df2}\u{5f00}\u{542f}\u{4f46}\u{4ee3}\u{7406}\u{5730}\u{5740}\u{4e3a}\u{7a7a}".to_string());
        }
        let proxy = Proxy::all(&proxy_value).map_err(|e| e.to_string())?;
        client_builder = client_builder.proxy(proxy);
    }

    client_builder.build().map_err(|e| e.to_string())
}

fn take_non_empty_token(value: Option<String>, missing_message: &str) -> Result<String, String> {
    let value = value.unwrap_or_default();
    if value.trim().is_empty() {
        return Err(missing_message.to_string());
    }
    Ok(value)
}

fn is_current_chatgpt_account(chatgpt_account_id: &str) -> bool {
    get_current_auth_account_id()
        .map(|current_account_id| current_account_id == chatgpt_account_id)
        .unwrap_or(false)
}

fn extract_auth_credentials(auth_json: &str) -> Result<(String, String), String> {
    let auth: AuthConfig = serde_json::from_str(auth_json).map_err(|e| e.to_string())?;
    let tokens = auth
        .tokens
        .ok_or_else(|| "Missing tokens in auth.json".to_string())?;

    let access_token = take_non_empty_token(tokens.access_token, "Missing access token")?;
    let chatgpt_account_id = take_non_empty_token(tokens.account_id, "Missing ChatGPT account ID")?;

    Ok((access_token, chatgpt_account_id))
}

async fn fetch_wham_account_metadata(
    auth_json: &str,
    proxy_enabled: Option<bool>,
    proxy_url: Option<String>,
) -> Result<Option<WhamAccountMetadata>, String> {
    let (access_token, chatgpt_account_id) = extract_auth_credentials(auth_json)?;
    let client = build_http_client(proxy_enabled, proxy_url)?;

    let response = client
        .get("https://chatgpt.com/backend-api/wham/accounts/check")
        .header("Authorization", format!("Bearer {}", access_token))
        .header("Accept", "application/json")
        .header("ChatGPT-Account-Id", &chatgpt_account_id)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        return Err(format!(
            "wham/accounts/check 请求失败: {}",
            response.status()
        ));
    }

    let body = response.text().await.map_err(|e| e.to_string())?;
    let value: WhamAccountsCheckResponse =
        serde_json::from_str(&body).map_err(|e| e.to_string())?;
    let matched = value
        .accounts
        .into_iter()
        .find(|account| account.id == chatgpt_account_id);

    Ok(matched.map(|account| WhamAccountMetadata {
        workspace_name: match account.structure.as_deref() {
            Some("workspace") => account.name.filter(|name| !name.trim().is_empty()),
            _ => None,
        },
        account_user_id: account.account_user_id,
        account_structure: account.structure,
        plan_type: account.plan_type,
    }))
}

fn get_current_auth_account_id() -> Result<String, String> {
    let path = get_codex_auth_path()?;
    if !path.exists() {
        return Err("Codex auth.json not found".to_string());
    }
    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let auth: AuthConfig = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    let tokens = auth
        .tokens
        .ok_or_else(|| "Missing tokens in auth.json".to_string())?;
    take_non_empty_token(tokens.account_id, "Missing account_id in auth.json")
}

#[tauri::command]
async fn get_wham_account_metadata(
    account_id: String,
    proxy_enabled: Option<bool>,
    proxy_url: Option<String>,
) -> Result<Option<WhamAccountMetadata>, String> {
    if account_id.is_empty() {
        return Ok(None);
    }

    let auth_json = read_account_auth(account_id)?;
    fetch_wham_account_metadata(&auth_json, proxy_enabled, proxy_url).await
}

// ==================== 用量解析相关结构 ====================

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct RateLimitEntry {
    used_percent: f64,
    window_minutes: u32,
    resets_at: i64,
}

#[derive(Debug, Deserialize)]
struct RateLimits {
    primary: Option<RateLimitEntry>,
    secondary: Option<RateLimitEntry>,
}

#[derive(Debug, Deserialize)]
struct EventMsg {
    #[serde(rename = "type")]
    msg_type: String,
    payload: Option<serde_json::Value>,
}

#[derive(Debug, Serialize)]
pub struct UsageData {
    pub five_hour_percent_left: Option<f64>,
    pub five_hour_reset_time_ms: Option<i64>,
    pub weekly_percent_left: Option<f64>,
    pub weekly_reset_time_ms: Option<i64>,
    pub code_review_percent_left: Option<f64>,
    pub code_review_reset_time_ms: Option<i64>,
    pub last_updated: String,
    pub source_file: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct UsageResult {
    pub status: String,
    pub message: Option<String>,
    pub plan_type: Option<String>,
    pub usage: Option<UsageData>,
}

/// 获取 codex sessions 目录路径
fn get_codex_sessions_dir() -> Result<PathBuf, String> {
    dirs::home_dir()
        .map(|p| p.join(".codex").join("sessions"))
        .ok_or_else(|| "Cannot find home directory".to_string())
}

fn start_session_watcher() {
    let sessions_dir = match get_codex_sessions_dir() {
        Ok(dir) => dir,
        Err(err) => {
            log::warn!("Failed to resolve sessions dir: {}", err);
            return;
        }
    };

    if !sessions_dir.exists() {
        log::warn!("Sessions directory not found for watcher");
        return;
    }

    std::thread::spawn(move || {
        let (tx, rx) = std::sync::mpsc::channel();
        let mut watcher = match notify::recommended_watcher(move |res| {
            let _ = tx.send(res);
        }) {
            Ok(w) => w,
            Err(err) => {
                log::error!("Failed to start watcher: {}", err);
                return;
            }
        };

        if let Err(err) = watcher.watch(&sessions_dir, RecursiveMode::Recursive) {
            log::error!("Failed to watch sessions dir: {}", err);
            return;
        }

        for res in rx {
            let event = match res {
                Ok(ev) => ev,
                Err(_) => continue,
            };

            if !matches!(event.kind, EventKind::Create(_) | EventKind::Modify(_)) {
                continue;
            }

            for path in event.paths {
                if path.extension().map_or(false, |ext| ext == "jsonl") {
                    if let Err(err) = bind_session_file_to_current_auth(&path) {
                        log::debug!("Bind session skipped: {}", err);
                    }
                }
            }
        }
    });
}

/// 查找最新的 session 日志文件
fn find_latest_session_file() -> Result<PathBuf, String> {
    let sessions_dir = get_codex_sessions_dir()?;

    if !sessions_dir.exists() {
        return Err("Sessions directory not found".to_string());
    }

    let mut all_files: Vec<PathBuf> = Vec::new();

    // 递归遍历 sessions 目录查找所有 .jsonl 文件
    fn collect_jsonl_files(dir: &PathBuf, files: &mut Vec<PathBuf>) -> std::io::Result<()> {
        if dir.is_dir() {
            for entry in fs::read_dir(dir)? {
                let entry = entry?;
                let path = entry.path();
                if path.is_dir() {
                    collect_jsonl_files(&path, files)?;
                } else if path.extension().map_or(false, |ext| ext == "jsonl") {
                    files.push(path);
                }
            }
        }
        Ok(())
    }

    collect_jsonl_files(&sessions_dir, &mut all_files)
        .map_err(|e| format!("Failed to read sessions directory: {}", e))?;

    if all_files.is_empty() {
        return Err("No session files found".to_string());
    }

    // 按修改时间排序，获取最新的
    all_files.sort_by(|a, b| {
        let a_time = fs::metadata(a).and_then(|m| m.modified()).ok();
        let b_time = fs::metadata(b).and_then(|m| m.modified()).ok();
        b_time.cmp(&a_time)
    });

    Ok(all_files[0].clone())
}

/// 从 JSONL 文件中解析最新的 rate_limits 信息
fn parse_rate_limits_from_file(file_path: &PathBuf) -> Result<UsageData, String> {
    let file = fs::File::open(file_path).map_err(|e| format!("Failed to open file: {}", e))?;

    let reader = BufReader::new(file);
    let mut latest_rate_limits: Option<RateLimits> = None;

    // 读取所有行，找到最后一个有效的 rate_limits
    for line in reader.lines() {
        let line = match line {
            Ok(l) => l,
            Err(_) => continue,
        };

        if line.is_empty() {
            continue;
        }

        // 尝试解析 JSON
        let event: EventMsg = match serde_json::from_str(&line) {
            Ok(e) => e,
            Err(_) => continue,
        };

        // 检查是否是 token_count 类型的事件
        if event.msg_type == "event_msg" || event.msg_type == "token_count" {
            if let Some(payload) = event.payload {
                // 尝试从 payload 中提取 rate_limits
                if let Some(rate_limits) = payload.get("rate_limits") {
                    if let Ok(rl) = serde_json::from_value::<RateLimits>(rate_limits.clone()) {
                        latest_rate_limits = Some(rl);
                    }
                }
            }
        }
    }

    let rate_limits =
        latest_rate_limits.ok_or_else(|| "No rate limits found in session file".to_string())?;

    // 转换为 UsageData
    let primary = rate_limits
        .primary
        .ok_or_else(|| "No primary rate limit found".to_string())?;
    let secondary = rate_limits
        .secondary
        .ok_or_else(|| "No secondary rate limit found".to_string())?;

    let primary_used = validate_used_percent(primary.used_percent)?;
    let secondary_used = validate_used_percent(secondary.used_percent)?;
    let five_hour_reset_ms = normalize_unix_timestamp_ms(primary.resets_at)?;
    let weekly_reset_ms = normalize_unix_timestamp_ms(secondary.resets_at)?;
    let last_updated = fs::metadata(file_path)
        .and_then(|m| m.modified())
        .ok()
        .and_then(epoch_ms_from_system_time)
        .map(|ms| ms.to_string())
        .unwrap_or_else(now_epoch_ms_string);

    Ok(UsageData {
        five_hour_percent_left: Some(100.0 - primary_used),
        five_hour_reset_time_ms: Some(five_hour_reset_ms),
        weekly_percent_left: Some(100.0 - secondary_used),
        weekly_reset_time_ms: Some(weekly_reset_ms),
        code_review_percent_left: None,
        code_review_reset_time_ms: None,
        last_updated,
        source_file: Some(file_path.to_string_lossy().to_string()),
    })
}

fn now_epoch_ms_string() -> String {
    match SystemTime::now().duration_since(UNIX_EPOCH) {
        Ok(duration) => duration.as_millis().to_string(),
        Err(_) => "0".to_string(),
    }
}

fn epoch_ms_from_system_time(time: SystemTime) -> Option<i64> {
    time.duration_since(UNIX_EPOCH)
        .ok()
        .and_then(|d| i64::try_from(d.as_millis()).ok())
}

fn normalize_unix_timestamp_ms(timestamp: i64) -> Result<i64, String> {
    if timestamp <= 0 {
        return Err("Invalid reset timestamp".to_string());
    }

    let ms = if timestamp >= 1_000_000_000_000 {
        timestamp
    } else {
        timestamp * 1000
    };

    if ms < MIN_VALID_EPOCH_MS || ms > MAX_VALID_EPOCH_MS {
        return Err("Reset timestamp out of valid range".to_string());
    }

    Ok(ms)
}

fn validate_used_percent(value: f64) -> Result<f64, String> {
    if value.is_nan() || value < 0.0 || value > 100.0 {
        return Err("Invalid used_percent in rate_limits".to_string());
    }
    Ok(value)
}

#[derive(Debug)]
struct ParsedLimit {
    percent_left: f64,
    reset_time_ms: i64,
    window_minutes: Option<u32>,
}

#[derive(Debug, Default)]
struct ParsedUsageLimits {
    five_hour: Option<ParsedLimit>,
    weekly: Option<ParsedLimit>,
}

fn json_to_f64(value: &serde_json::Value) -> Option<f64> {
    value
        .as_f64()
        .or_else(|| value.as_i64().map(|v| v as f64))
        .or_else(|| value.as_str().and_then(|s| s.parse::<f64>().ok()))
}

fn json_to_i64(value: &serde_json::Value) -> Option<i64> {
    value
        .as_i64()
        .or_else(|| value.as_u64().and_then(|v| i64::try_from(v).ok()))
        .or_else(|| value.as_f64().map(|v| v.round() as i64))
        .or_else(|| value.as_str().and_then(|s| s.parse::<i64>().ok()))
}

fn extract_reset_time_ms(value: &serde_json::Value) -> Option<i64> {
    let direct_fields = [
        "reset_at_ms",
        "resets_at_ms",
        "reset_time_ms",
        "reset_at",
        "resets_at",
        "reset",
    ];

    for field in direct_fields.iter() {
        if let Some(raw) = value.get(*field).and_then(json_to_i64) {
            return Some(raw);
        }
    }

    let now_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .ok()
        .and_then(|d| i64::try_from(d.as_millis()).ok())
        .unwrap_or(0);

    if let Some(seconds) = value.get("reset_in_seconds").and_then(json_to_i64) {
        return Some(now_ms.saturating_add(seconds.saturating_mul(1000)));
    }

    if let Some(seconds) = value.get("reset_after_seconds").and_then(json_to_i64) {
        return Some(now_ms.saturating_add(seconds.saturating_mul(1000)));
    }

    if let Some(seconds) = value.get("reset_in").and_then(json_to_i64) {
        return Some(now_ms.saturating_add(seconds.saturating_mul(1000)));
    }

    None
}

fn parse_rate_limit_entry(value: &serde_json::Value) -> Result<ParsedLimit, String> {
    let used_percent = value
        .get("used_percent")
        .or_else(|| value.get("usedPercent"))
        .and_then(json_to_f64);
    let used = value.get("used").and_then(json_to_f64);
    let remaining = value.get("remaining").and_then(json_to_f64);
    let limit = value
        .get("limit")
        .or_else(|| value.get("total"))
        .or_else(|| value.get("capacity"))
        .and_then(json_to_f64);

    let percent_left = if let Some(used_percent) = used_percent {
        let used_norm = if used_percent <= 1.0 && used_percent.fract() != 0.0 {
            used_percent * 100.0
        } else {
            used_percent
        };
        100.0 - used_norm
    } else if let (Some(remaining), Some(limit)) = (remaining, limit) {
        if limit <= 0.0 {
            return Err("Invalid limit value".to_string());
        }
        (remaining / limit) * 100.0
    } else if let (Some(used), Some(limit)) = (used, limit) {
        if limit <= 0.0 {
            return Err("Invalid limit value".to_string());
        }
        100.0 - (used / limit) * 100.0
    } else {
        return Err("Missing usage fields in rate_limit entry".to_string());
    };

    let raw_reset =
        extract_reset_time_ms(value).ok_or_else(|| "Missing reset timestamp".to_string())?;
    let reset_time_ms = normalize_unix_timestamp_ms(raw_reset)?;

    let window_minutes = value
        .get("window_minutes")
        .and_then(json_to_i64)
        .and_then(|v| u32::try_from(v).ok())
        .or_else(|| {
            value
                .get("window_seconds")
                .and_then(json_to_i64)
                .and_then(|v| u32::try_from(v / 60).ok())
        })
        .or_else(|| {
            value
                .get("limit_window_seconds")
                .and_then(json_to_i64)
                .and_then(|v| u32::try_from(v / 60).ok())
        });

    Ok(ParsedLimit {
        percent_left: percent_left.clamp(0.0, 100.0),
        reset_time_ms,
        window_minutes,
    })
}

#[derive(Debug, PartialEq, Eq)]
enum LimitKind {
    FiveHour,
    Weekly,
}

fn detect_limit_kind(value: &serde_json::Value, window_minutes: Option<u32>) -> Option<LimitKind> {
    if let Some(kind) = value
        .get("type")
        .and_then(|v| v.as_str())
        .or_else(|| value.get("name").and_then(|v| v.as_str()))
    {
        let kind_lower = kind.to_lowercase();
        if kind_lower.contains("week") {
            return Some(LimitKind::Weekly);
        }
        if kind_lower.contains("five") || kind_lower.contains("5h") || kind_lower.contains("hour") {
            return Some(LimitKind::FiveHour);
        }
    }

    if let Some(minutes) = window_minutes {
        if minutes <= 360 {
            return Some(LimitKind::FiveHour);
        }
        if minutes >= 10080 {
            return Some(LimitKind::Weekly);
        }
    }

    None
}

fn assign_parsed_limit(
    limits: &mut ParsedUsageLimits,
    entry: &serde_json::Value,
) -> Result<(), String> {
    let parsed = parse_rate_limit_entry(entry)?;
    match detect_limit_kind(entry, parsed.window_minutes) {
        Some(LimitKind::FiveHour) => limits.five_hour = Some(parsed),
        Some(LimitKind::Weekly) => limits.weekly = Some(parsed),
        None => {
            if limits.five_hour.is_none() {
                limits.five_hour = Some(parsed);
            } else if limits.weekly.is_none() {
                limits.weekly = Some(parsed);
            }
        }
    }

    Ok(())
}

fn parse_rate_limits(value: &serde_json::Value) -> Result<ParsedUsageLimits, String> {
    let mut limits = ParsedUsageLimits::default();
    let mut handled_explicit_entries = false;

    for key in ["primary", "secondary", "primary_window", "secondary_window"] {
        if let Some(entry) = value.get(key).filter(|entry| !entry.is_null()) {
            handled_explicit_entries = true;
            assign_parsed_limit(&mut limits, entry)?;
        }
    }

    if !handled_explicit_entries {
        let entries = value
            .get("limits")
            .and_then(|v| v.as_array())
            .cloned()
            .or_else(|| value.as_array().cloned())
            .ok_or_else(|| "Missing rate_limit entries".to_string())?;

        for entry in entries.iter() {
            assign_parsed_limit(&mut limits, entry)?;
        }
    }

    if limits.five_hour.is_none() && limits.weekly.is_none() {
        return Err("Missing usable rate_limit data".to_string());
    }

    Ok(limits)
}

fn parse_optional_rate_limit(value: &serde_json::Value) -> Option<ParsedLimit> {
    if let Some(primary) = value.get("primary") {
        return parse_rate_limit_entry(primary).ok();
    }

    if let Some(primary) = value.get("primary_window") {
        return parse_rate_limit_entry(primary).ok();
    }

    if let Some(entries) = value.get("limits").and_then(|v| v.as_array()) {
        return entries
            .first()
            .and_then(|entry| parse_rate_limit_entry(entry).ok());
    }

    if let Some(entries) = value.as_array() {
        return entries
            .first()
            .and_then(|entry| parse_rate_limit_entry(entry).ok());
    }

    parse_rate_limit_entry(value).ok()
}

fn parse_session_meta(file_path: &PathBuf) -> Result<(String, String), String> {
    let file = fs::File::open(file_path).map_err(|e| format!("Failed to open file: {}", e))?;
    let reader = BufReader::new(file);

    for line in reader.lines() {
        let line = match line {
            Ok(l) => l,
            Err(_) => continue,
        };

        if line.is_empty() {
            continue;
        }

        let value: serde_json::Value = match serde_json::from_str(&line) {
            Ok(v) => v,
            Err(_) => continue,
        };

        if value.get("type").and_then(|v| v.as_str()) == Some("session_meta") {
            let payload = value
                .get("payload")
                .ok_or_else(|| "Missing session payload".to_string())?;
            let session_id = payload
                .get("id")
                .and_then(|v| v.as_str())
                .ok_or_else(|| "Missing session id".to_string())?;
            let created_at = payload
                .get("timestamp")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            return Ok((session_id.to_string(), created_at));
        }
    }

    Err("No session_meta found".to_string())
}

fn bind_session_file_to_account(account_id: &str, file_path: &PathBuf) -> Result<(), String> {
    let (session_id, created_at) = parse_session_meta(file_path).or_else(|_| {
        let fallback = fs::metadata(file_path)
            .and_then(|m| m.modified())
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_secs().to_string())
            .unwrap_or_else(|| "0".to_string());
        Ok::<(String, String), String>((file_path.to_string_lossy().to_string(), fallback))
    })?;

    let binding = SessionBinding {
        session_id,
        created_at,
        file_path: file_path.to_string_lossy().to_string(),
        bound_at: now_epoch_ms_string(),
    };

    update_usage_bindings(account_id, binding)
}

fn bind_session_file_to_current_auth(file_path: &PathBuf) -> Result<(), String> {
    let account_id = get_current_auth_account_id()?;
    bind_session_file_to_account(&account_id, file_path)
}

/// 获取账号的用量信息（通过解析本地 session 日志）
#[tauri::command]
fn get_usage_from_sessions() -> Result<UsageData, String> {
    let latest_file = find_latest_session_file()?;
    parse_rate_limits_from_file(&latest_file)
}

/// 获取绑定账号的用量信息
#[tauri::command]
fn get_bound_usage(account_id: String) -> Result<UsageData, String> {
    if account_id.is_empty() {
        return Err("Missing account id".to_string());
    }

    let path = get_latest_bound_session_path(&account_id)?;
    let mut data = parse_rate_limits_from_file(&path)?;
    data.source_file = Some(path.to_string_lossy().to_string());
    Ok(data)
}

/// 通过 wham/usage API 获取 Codex quota
#[tauri::command]
async fn get_codex_wham_usage(
    account_id: String,
    proxy_enabled: Option<bool>,
    proxy_url: Option<String>,
) -> Result<UsageResult, String> {
    if account_id.is_empty() {
        return Ok(UsageResult {
            status: "missing_account_id".to_string(),
            message: Some("\u{7f3a}\u{5c11} ChatGPT account ID".to_string()),
            plan_type: None,
            usage: None,
        });
    }

    let auth_json = read_account_auth(account_id)?;
    let auth: AuthConfig = serde_json::from_str(&auth_json).map_err(|e| e.to_string())?;
    let tokens = match auth.tokens {
        Some(tokens) => tokens,
        None => {
            return Ok(UsageResult {
                status: "missing_token".to_string(),
                message: Some("\u{7f3a}\u{5c11} access token".to_string()),
                plan_type: None,
                usage: None,
            })
        }
    };

    let access_token =
        match take_non_empty_token(tokens.access_token, "\u{7f3a}\u{5c11} access token") {
            Ok(value) => value,
            Err(message) => {
                return Ok(UsageResult {
                    status: "missing_token".to_string(),
                    message: Some(message),
                    plan_type: None,
                    usage: None,
                })
            }
        };
    let chatgpt_account_id =
        match take_non_empty_token(tokens.account_id, "\u{7f3a}\u{5c11} ChatGPT account ID") {
            Ok(value) => value,
            Err(message) => {
                return Ok(UsageResult {
                    status: "missing_account_id".to_string(),
                    message: Some(message),
                    plan_type: None,
                    usage: None,
                })
            }
        };
    let is_current_account = is_current_chatgpt_account(&chatgpt_account_id);

    let client = match build_http_client(proxy_enabled, proxy_url) {
        Ok(client) => client,
        Err(message) => {
            return Ok(UsageResult {
                status: "error".to_string(),
                message: Some(message),
                plan_type: None,
                usage: None,
            })
        }
    };

    let send_request = || {
        client
            .get("https://chatgpt.com/backend-api/wham/usage")
            .header("Authorization", format!("Bearer {}", access_token))
            .header("Accept", "application/json")
            .header("ChatGPT-Account-Id", &chatgpt_account_id)
            .send()
    };

    let response = match send_request().await {
        Ok(resp) => resp,
        Err(first_err) => {
            log::warn!("wham/usage \u{9996}\u{6b21}\u{8bf7}\u{6c42}\u{5931}\u{8d25}\u{ff0c}1 \u{79d2}\u{540e}\u{91cd}\u{8bd5}: {}", first_err);
            tokio::time::sleep(std::time::Duration::from_secs(1)).await;
            match send_request().await {
                Ok(resp) => resp,
                Err(retry_err) => {
                    return Ok(UsageResult {
                        status: "error".to_string(),
                        message: Some(format!("\u{8bf7}\u{6c42}\u{5931}\u{8d25}\u{ff08}\u{5df2}\u{91cd}\u{8bd5}\u{ff09}: {}", retry_err)),
                        plan_type: None,
                        usage: None,
                    })
                }
            }
        }
    };

    let status = response.status();
    let body = response.text().await.map_err(|e| e.to_string())?;

    if status == reqwest::StatusCode::UNAUTHORIZED {
        let (status, message) = if is_current_account {
            (
                "expired".to_string(),
                "\u{5f53}\u{524d}\u{8d26}\u{53f7}\u{767b}\u{5f55}\u{6001}\u{5df2}\u{5931}\u{6548}\u{ff0c}\u{8bf7}\u{91cd}\u{65b0}\u{767b}\u{5f55} Codex".to_string(),
            )
        } else {
            (
                "stale_token".to_string(),
                "\u{8be5}\u{8d26}\u{53f7}\u{7f13}\u{5b58}\u{7684} access token \u{5df2}\u{5931}\u{6548}\u{ff0c}\u{8bf7}\u{5207}\u{6362}\u{5230}\u{8be5}\u{8d26}\u{53f7}\u{5e76}\u{91cd}\u{65b0}\u{5b8c}\u{6210}\u{4e00}\u{6b21} Codex \u{767b}\u{5f55}".to_string(),
            )
        };

        return Ok(UsageResult {
            status,
            message: Some(message),
            plan_type: None,
            usage: None,
        });
    }

    if status == reqwest::StatusCode::FORBIDDEN {
        return Ok(UsageResult {
            status: "forbidden".to_string(),
            message: Some("\u{8d26}\u{53f7}\u{5df2}\u{88ab}\u{5c01}\u{7981}\u{6216}\u{65e0}\u{6743}\u{8bbf}\u{95ee}".to_string()),
            plan_type: None,
            usage: None,
        });
    }

    if !status.is_success() {
        return Ok(UsageResult {
            status: "error".to_string(),
            message: Some(format!(
                "wham/usage \u{8bf7}\u{6c42}\u{5931}\u{8d25}: {}",
                status
            )),
            plan_type: None,
            usage: None,
        });
    }

    let value: serde_json::Value = serde_json::from_str(&body).map_err(|e| e.to_string())?;
    let plan_type = value
        .get("plan_type")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    let rate_limit_value = match value.get("rate_limit").or_else(|| value.get("rate_limits")) {
        Some(value) => value,
        None => {
            return Ok(UsageResult {
                status: "no_usage".to_string(),
                message: Some("Missing rate_limit in response".to_string()),
                plan_type,
                usage: None,
            })
        }
    };

    let parsed_limits = match parse_rate_limits(rate_limit_value) {
        Ok(parsed) => parsed,
        Err(err) => {
            return Ok(UsageResult {
                status: "no_usage".to_string(),
                message: Some(err),
                plan_type,
                usage: None,
            })
        }
    };

    let code_review = value
        .get("code_review_rate_limit")
        .and_then(parse_optional_rate_limit);

    let usage = UsageData {
        five_hour_percent_left: parsed_limits
            .five_hour
            .as_ref()
            .map(|limit| limit.percent_left),
        five_hour_reset_time_ms: parsed_limits
            .five_hour
            .as_ref()
            .map(|limit| limit.reset_time_ms),
        weekly_percent_left: parsed_limits
            .weekly
            .as_ref()
            .map(|limit| limit.percent_left),
        weekly_reset_time_ms: parsed_limits
            .weekly
            .as_ref()
            .map(|limit| limit.reset_time_ms),
        code_review_percent_left: code_review.as_ref().map(|l| l.percent_left),
        code_review_reset_time_ms: code_review.as_ref().map(|l| l.reset_time_ms),
        last_updated: now_epoch_ms_string(),
        source_file: None,
    };

    Ok(UsageResult {
        status: "ok".to_string(),
        message: None,
        plan_type,
        usage: Some(usage),
    })
}

fn json_contains_string(value: &serde_json::Value, needle: &str) -> bool {
    match value {
        serde_json::Value::String(s) => s == needle,
        serde_json::Value::Array(items) => items.iter().any(|v| json_contains_string(v, needle)),
        serde_json::Value::Object(map) => map.values().any(|v| json_contains_string(v, needle)),
        _ => false,
    }
}

/// 从指定文件解析用量信息
#[tauri::command]
fn get_usage_from_file(file_path: String) -> Result<UsageData, String> {
    let path = PathBuf::from(file_path);
    if !path.exists() {
        return Err("Usage source file not found".to_string());
    }
    parse_rate_limits_from_file(&path)
}

/// 获取指定账号的用量信息
/// 需要先切换到该账号，然后查找其 session 文件
#[tauri::command]
fn get_account_usage(account_email: String) -> Result<UsageData, String> {
    let sessions_dir = get_codex_sessions_dir()?;

    if !sessions_dir.exists() {
        return Err("Sessions directory not found".to_string());
    }

    let mut all_files: Vec<PathBuf> = Vec::new();

    fn collect_jsonl_files(dir: &PathBuf, files: &mut Vec<PathBuf>) -> std::io::Result<()> {
        if dir.is_dir() {
            for entry in fs::read_dir(dir)? {
                let entry = entry?;
                let path = entry.path();
                if path.is_dir() {
                    collect_jsonl_files(&path, files)?;
                } else if path.extension().map_or(false, |ext| ext == "jsonl") {
                    files.push(path);
                }
            }
        }
        Ok(())
    }

    collect_jsonl_files(&sessions_dir, &mut all_files)
        .map_err(|e| format!("Failed to read sessions directory: {}", e))?;

    // 按修改时间排序（最新的在前）
    all_files.sort_by(|a, b| {
        let a_time = fs::metadata(a).and_then(|m| m.modified()).ok();
        let b_time = fs::metadata(b).and_then(|m| m.modified()).ok();
        b_time.cmp(&a_time)
    });

    // 遍历文件，查找包含指定账号的 rate_limits
    for file_path in all_files.iter().take(20) {
        // 只检查最近20个文件
        let file = match fs::File::open(file_path) {
            Ok(f) => f,
            Err(_) => continue,
        };

        let reader = BufReader::new(file);
        let mut found_account = false;
        let mut latest_rate_limits: Option<RateLimits> = None;

        for line in reader.lines() {
            let line = match line {
                Ok(l) => l,
                Err(_) => continue,
            };

            if line.is_empty() {
                continue;
            }

            let value: serde_json::Value = match serde_json::from_str(&line) {
                Ok(v) => v,
                Err(_) => continue,
            };

            // 仅在明确的上下文里匹配邮箱，避免误判
            if !found_account && !account_email.is_empty() {
                if let Some(entry_type) = value.get("type").and_then(|v| v.as_str()) {
                    if entry_type == "session_meta" || entry_type == "turn_context" {
                        if json_contains_string(&value, &account_email) {
                            found_account = true;
                        }
                    }
                }
            }

            // 解析 rate_limits
            if let Ok(event) = serde_json::from_value::<EventMsg>(value) {
                if event.msg_type == "event_msg" || event.msg_type == "token_count" {
                    if let Some(payload) = event.payload {
                        if let Some(rate_limits) = payload.get("rate_limits") {
                            if let Ok(rl) =
                                serde_json::from_value::<RateLimits>(rate_limits.clone())
                            {
                                latest_rate_limits = Some(rl);
                            }
                        }
                    }
                }
            }
        }

        // 如果找到了账号且有 rate_limits，返回结果
        if found_account {
            if let Some(rate_limits) = latest_rate_limits {
                if let (Some(primary), Some(secondary)) =
                    (rate_limits.primary, rate_limits.secondary)
                {
                    let primary_used = validate_used_percent(primary.used_percent)?;
                    let secondary_used = validate_used_percent(secondary.used_percent)?;
                    let five_hour_reset_ms = normalize_unix_timestamp_ms(primary.resets_at)?;
                    let weekly_reset_ms = normalize_unix_timestamp_ms(secondary.resets_at)?;
                    let last_updated = fs::metadata(file_path)
                        .and_then(|m| m.modified())
                        .ok()
                        .and_then(epoch_ms_from_system_time)
                        .map(|ms| ms.to_string())
                        .unwrap_or_else(now_epoch_ms_string);

                    return Ok(UsageData {
                        five_hour_percent_left: Some(100.0 - primary_used),
                        five_hour_reset_time_ms: Some(five_hour_reset_ms),
                        weekly_percent_left: Some(100.0 - secondary_used),
                        weekly_reset_time_ms: Some(weekly_reset_ms),
                        code_review_percent_left: None,
                        code_review_reset_time_ms: None,
                        last_updated,
                        source_file: Some(file_path.to_string_lossy().to_string()),
                    });
                }
            }
        }
    }

    Err(format!(
        "No usage data found for account: {}",
        account_email
    ))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            start_session_watcher();
            initialize_tray(&app.handle())?;
            start_background_auto_refresh(&app.handle());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            load_accounts_store,
            save_accounts_store,
            write_codex_auth,
            read_codex_auth,
            refresh_tray_menu,
            show_main_window,
            hide_to_tray,
            exit_application,
            start_codex_login,
            cancel_codex_login,
            save_account_auth,
            read_account_auth,
            delete_account_auth,
            read_file_content,
            write_file_content,
            get_home_dir,
            restart_codex_processes,
            get_wham_account_metadata,
            get_codex_wham_usage,
            get_usage_from_sessions,
            get_bound_usage,
            get_usage_from_file,
            get_account_usage,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_auth_json(id_token: &str) -> String {
        format!(
            r#"{{
  "OPENAI_API_KEY": null,
  "tokens": {{
    "id_token": "{}",
    "access_token": "access",
    "refresh_token": "refresh",
    "account_id": "account"
  }},
  "last_refresh": "2026-03-27T00:00:00.000Z"
}}"#,
            id_token
        )
    }

    #[test]
    fn empty_codex_path_falls_back_to_default() {
        assert_eq!(normalize_codex_command_input(None), "codex");
        assert_eq!(
            normalize_codex_command_input(Some("   ".to_string())),
            "codex"
        );
    }

    #[test]
    fn surrounding_quotes_are_removed_from_codex_path() {
        assert_eq!(
            normalize_codex_command_input(Some(
                "\"C:\\Program Files\\OpenAI\\codex.exe\"".to_string(),
            )),
            r"C:\Program Files\OpenAI\codex.exe"
        );
        assert_eq!(
            normalize_codex_command_input(Some(
                "'C:\\Program Files\\OpenAI\\codex.exe'".to_string(),
            )),
            r"C:\Program Files\OpenAI\codex.exe"
        );
    }

    #[test]
    fn timeout_seconds_have_reasonable_floor() {
        assert_eq!(
            normalize_login_timeout_seconds(None),
            DEFAULT_LOGIN_TIMEOUT_SECONDS
        );
        assert_eq!(
            normalize_login_timeout_seconds(Some(0)),
            DEFAULT_LOGIN_TIMEOUT_SECONDS
        );
        assert_eq!(normalize_login_timeout_seconds(Some(5)), 30);
        assert_eq!(normalize_login_timeout_seconds(Some(120)), 120);
    }

    #[test]
    fn auth_change_detection_checks_content_and_mtime() {
        let old = AuthSnapshot {
            modified: None,
            content: Some("old".to_string()),
        };
        let same = AuthSnapshot {
            modified: None,
            content: Some("old".to_string()),
        };
        let changed = AuthSnapshot {
            modified: None,
            content: Some("new".to_string()),
        };

        assert!(!auth_snapshot_changed(&old, &same));
        assert!(auth_snapshot_changed(&old, &changed));
    }

    #[test]
    fn login_auth_validation_requires_id_token() {
        assert!(validate_login_auth_json(&sample_auth_json("token")).is_ok());
        assert!(validate_login_auth_json(&sample_auth_json("")).is_err());
        assert!(validate_login_auth_json("{\"tokens\":{}}").is_err());
    }

    #[test]
    fn direct_invocation_is_used_for_explicit_exe_path() {
        let invocation = resolve_login_invocation(Some(r"C:\tools\codex.exe".to_string()))
            .expect("should build invocation");

        assert_eq!(invocation.program, r"C:\tools\codex.exe");
        assert_eq!(invocation.args, vec!["login".to_string()]);
        assert_eq!(invocation.mode, LoginCommandMode::Direct);
    }

    #[test]
    fn powershell_invocation_is_used_for_ps1_path() {
        let invocation = resolve_login_invocation(Some(r"C:\tools\codex.ps1".to_string()))
            .expect("should build invocation");

        assert_eq!(invocation.program, "powershell");
        assert_eq!(invocation.mode, LoginCommandMode::PowerShell);
        assert!(invocation.args.iter().any(|arg| arg == "login"));
    }

    #[test]
    fn tray_close_behavior_defaults_to_ask() {
        assert_eq!(normalize_tray_close_behavior(None), "ask");
        assert_eq!(normalize_tray_close_behavior(Some("unknown")), "ask");
        assert_eq!(normalize_tray_close_behavior(Some("tray")), "tray");
        assert_eq!(normalize_tray_close_behavior(Some("exit")), "exit");
    }

    #[test]
    fn tray_account_title_includes_quota_summary() {
        let account = TrayStoredAccount {
            id: "1".to_string(),
            alias: "测试账号".to_string(),
            account_info: TrayAccountInfo {
                email: "test@example.com".to_string(),
                plan_type: "team".to_string(),
                account_id: None,
                user_id: None,
                account_user_id: None,
                account_structure: None,
                workspace_name: Some("团队空间".to_string()),
                subscription_active_until: Some("2026-04-26T13:24:00Z".to_string()),
                organizations: None,
            },
            usage_info: Some(TrayUsageSummary {
                status: Some("ok".to_string()),
                message: None,
                plan_type: Some("team".to_string()),
                context_window: None,
                five_hour_limit: Some(TrayLimitSummary {
                    percent_left: 46.0,
                    reset_time: "0".to_string(),
                }),
                weekly_limit: Some(TrayLimitSummary {
                    percent_left: 84.0,
                    reset_time: "0".to_string(),
                }),
                code_review_limit: None,
                last_updated: Some("0".to_string()),
                source_file: None,
            }),
            is_active: true,
            created_at: "0".to_string(),
            updated_at: "0".to_string(),
        };

        assert_eq!(
            build_tray_account_title(&account),
            "test@example.com / 团队空间"
        );
        assert_eq!(
            build_tray_account_detail(&account),
            "5H 46%  周 84%  审查 --  到期 2026-04-26"
        );
    }

    #[test]
    fn parse_rate_limits_supports_free_plan_weekly_only_window() {
        let value = serde_json::json!({
            "allowed": true,
            "limit_reached": false,
            "primary_window": {
                "used_percent": 0,
                "limit_window_seconds": 604800,
                "reset_after_seconds": 604800,
                "reset_at": 1777128605
            },
            "secondary_window": null
        });

        let parsed = parse_rate_limits(&value).expect("should parse free weekly-only usage");

        assert!(parsed.five_hour.is_none());
        assert_eq!(
            parsed
                .weekly
                .as_ref()
                .expect("weekly limit should exist")
                .percent_left,
            100.0
        );
    }

    #[test]
    fn parse_rate_limits_keeps_dual_window_behavior() {
        let value = serde_json::json!({
            "primary_window": {
                "used_percent": 12,
                "limit_window_seconds": 18000,
                "reset_at": 1777000000
            },
            "secondary_window": {
                "used_percent": 34,
                "limit_window_seconds": 604800,
                "reset_at": 1777600000
            }
        });

        let parsed = parse_rate_limits(&value).expect("should parse dual window usage");

        assert_eq!(
            parsed
                .five_hour
                .as_ref()
                .expect("five hour limit should exist")
                .percent_left,
            88.0
        );
        assert_eq!(
            parsed
                .weekly
                .as_ref()
                .expect("weekly limit should exist")
                .percent_left,
            66.0
        );
    }

    #[test]
    fn tray_account_detail_skips_missing_five_hour_limit() {
        let account = TrayStoredAccount {
            id: "1".to_string(),
            alias: "免费账号".to_string(),
            account_info: TrayAccountInfo {
                email: "free@example.com".to_string(),
                plan_type: "free".to_string(),
                account_id: None,
                user_id: None,
                account_user_id: None,
                account_structure: None,
                workspace_name: None,
                subscription_active_until: None,
                organizations: None,
            },
            usage_info: Some(TrayUsageSummary {
                status: Some("ok".to_string()),
                message: None,
                plan_type: Some("free".to_string()),
                context_window: None,
                five_hour_limit: None,
                weekly_limit: Some(TrayLimitSummary {
                    percent_left: 100.0,
                    reset_time: "04-24 10:10".to_string(),
                }),
                code_review_limit: Some(TrayLimitSummary {
                    percent_left: 100.0,
                    reset_time: "10:10".to_string(),
                }),
                last_updated: Some("0".to_string()),
                source_file: None,
            }),
            is_active: false,
            created_at: "0".to_string(),
            updated_at: "0".to_string(),
        };

        assert_eq!(
            build_tray_account_detail(&account),
            "周 100%  审查 100%  到期 --"
        );
    }

    #[test]
    fn background_auto_refresh_runs_immediately_and_respects_interval() {
        assert!(should_run_background_auto_refresh(30, 0, 1));
        assert!(!should_run_background_auto_refresh(0, 0, 1));
        assert!(!should_run_background_auto_refresh(30, 60_000, 1_800_000));
        assert!(should_run_background_auto_refresh(30, 60_000, 1_900_000));
    }
}
