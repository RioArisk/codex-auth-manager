use std::collections::HashMap;
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use notify::{EventKind, RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};

static USAGE_BINDINGS_LOCK: Mutex<()> = Mutex::new(());
const MIN_VALID_EPOCH_MS: i64 = 946684800000; // 2000-01-01T00:00:00Z
const MAX_VALID_EPOCH_MS: i64 = 4102444800000; // 2100-01-01T00:00:00Z

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

/// 获取用户主目录
#[tauri::command]
fn get_home_dir() -> Result<String, String> {
    dirs::home_dir()
        .map(|p| p.to_string_lossy().to_string())
        .ok_or_else(|| "Cannot find home directory".to_string())
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
    let _guard = USAGE_BINDINGS_LOCK.lock().map_err(|_| "Bindings lock poisoned".to_string())?;
    let mut store = load_usage_bindings_unlocked()?;
    for (existing_account, existing_entries) in store.bindings.iter() {
        if existing_account == account_id {
            continue;
        }
        if existing_entries.iter().any(|b| {
            b.session_id == binding.session_id || b.file_path == binding.file_path
        }) {
            return Err("Session file already bound to another account".to_string());
        }
    }
    let entries = store.bindings.entry(account_id.to_string()).or_default();
    if let Some(existing) = entries.iter_mut().find(|b| b.session_id == binding.session_id) {
        *existing = binding;
    } else {
        entries.push(binding);
    }
    entries.sort_by(|a, b| a.created_at.cmp(&b.created_at).then(a.bound_at.cmp(&b.bound_at)));
    if entries.len() > 200 {
        let start = entries.len().saturating_sub(200);
        entries.drain(0..start);
    }
    save_usage_bindings_unlocked(&store)
}

fn get_latest_bound_session_path(account_id: &str) -> Result<PathBuf, String> {
    let _guard = USAGE_BINDINGS_LOCK.lock().map_err(|_| "Bindings lock poisoned".to_string())?;
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
    account_id: Option<String>,
}

#[derive(Debug, Deserialize)]
struct AuthConfig {
    tokens: Option<AuthTokens>,
}

fn get_current_auth_account_id() -> Result<String, String> {
    let path = get_codex_auth_path()?;
    if !path.exists() {
        return Err("Codex auth.json not found".to_string());
    }
    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let auth: AuthConfig = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    auth.tokens
        .and_then(|t| t.account_id)
        .ok_or_else(|| "Missing account_id in auth.json".to_string())
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
    pub five_hour_percent_left: f64,
    pub five_hour_reset_time_ms: i64,
    pub weekly_percent_left: f64,
    pub weekly_reset_time_ms: i64,
    pub last_updated: String,
    pub source_file: Option<String>,
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
    let file = fs::File::open(file_path)
        .map_err(|e| format!("Failed to open file: {}", e))?;
    
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
    
    let rate_limits = latest_rate_limits
        .ok_or_else(|| "No rate limits found in session file".to_string())?;
    
    // 转换为 UsageData
    let primary = rate_limits.primary
        .ok_or_else(|| "No primary rate limit found".to_string())?;
    let secondary = rate_limits.secondary
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
        five_hour_percent_left: 100.0 - primary_used,
        five_hour_reset_time_ms: five_hour_reset_ms,
        weekly_percent_left: 100.0 - secondary_used,
        weekly_reset_time_ms: weekly_reset_ms,
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

fn parse_session_meta(file_path: &PathBuf) -> Result<(String, String), String> {
    let file = fs::File::open(file_path)
        .map_err(|e| format!("Failed to open file: {}", e))?;
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
    for file_path in all_files.iter().take(20) { // 只检查最近20个文件
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
                            if let Ok(rl) = serde_json::from_value::<RateLimits>(rate_limits.clone()) {
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
                if let (Some(primary), Some(secondary)) = (rate_limits.primary, rate_limits.secondary) {
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
                        five_hour_percent_left: 100.0 - primary_used,
                        five_hour_reset_time_ms: five_hour_reset_ms,
                        weekly_percent_left: 100.0 - secondary_used,
                        weekly_reset_time_ms: weekly_reset_ms,
                        last_updated,
                        source_file: Some(file_path.to_string_lossy().to_string()),
                    });
                }
            }
        }
    }
    
    Err(format!("No usage data found for account: {}", account_email))
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
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            load_accounts_store,
            save_accounts_store,
            write_codex_auth,
            read_codex_auth,
            save_account_auth,
            read_account_auth,
            delete_account_auth,
            read_file_content,
            get_home_dir,
            get_usage_from_sessions,
            get_bound_usage,
            get_usage_from_file,
            get_account_usage,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
