use std::collections::HashMap;
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use notify::{EventKind, RecursiveMode, Watcher};
use reqwest::{Client, Proxy};
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
    access_token: Option<String>,
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

    let raw_reset = extract_reset_time_ms(value).ok_or_else(|| "Missing reset timestamp".to_string())?;
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

fn parse_rate_limits(value: &serde_json::Value) -> Result<(ParsedLimit, ParsedLimit), String> {
    if let (Some(primary), Some(secondary)) = (value.get("primary"), value.get("secondary")) {
        let five = parse_rate_limit_entry(primary)?;
        let weekly = parse_rate_limit_entry(secondary)?;
        return Ok((five, weekly));
    }

    if let (Some(primary), Some(secondary)) = (
        value.get("primary_window"),
        value.get("secondary_window"),
    ) {
        let five = parse_rate_limit_entry(primary)?;
        let weekly = parse_rate_limit_entry(secondary)?;
        return Ok((five, weekly));
    }

    let entries = value
        .get("limits")
        .and_then(|v| v.as_array())
        .cloned()
        .or_else(|| value.as_array().cloned())
        .ok_or_else(|| "Missing rate_limit entries".to_string())?;

    let mut five: Option<ParsedLimit> = None;
    let mut weekly: Option<ParsedLimit> = None;

    for entry in entries.iter() {
        let parsed = parse_rate_limit_entry(entry)?;
        match detect_limit_kind(entry, parsed.window_minutes) {
            Some(LimitKind::FiveHour) => five = Some(parsed),
            Some(LimitKind::Weekly) => weekly = Some(parsed),
            None => {
                if five.is_none() {
                    five = Some(parsed);
                } else if weekly.is_none() {
                    weekly = Some(parsed);
                }
            }
        }
    }

    match (five, weekly) {
        (Some(five), Some(weekly)) => Ok((five, weekly)),
        _ => Err("Missing primary/weekly rate_limit data".to_string()),
    }
}

fn parse_optional_rate_limit(value: &serde_json::Value) -> Option<ParsedLimit> {
    if let Some(primary) = value.get("primary") {
        return parse_rate_limit_entry(primary).ok();
    }

    if let Some(primary) = value.get("primary_window") {
        return parse_rate_limit_entry(primary).ok();
    }

    if let Some(entries) = value.get("limits").and_then(|v| v.as_array()) {
        return entries.first().and_then(|entry| parse_rate_limit_entry(entry).ok());
    }

    if let Some(entries) = value.as_array() {
        return entries.first().and_then(|entry| parse_rate_limit_entry(entry).ok());
    }

    parse_rate_limit_entry(value).ok()
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
            message: Some("缺少 ChatGPT account ID".to_string()),
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
                message: Some("缺少 access token".to_string()),
                plan_type: None,
                usage: None,
            })
        }
    };
    let access_token = tokens.access_token;
    let chatgpt_account_id = tokens.account_id;

    if access_token.is_none() {
        return Ok(UsageResult {
            status: "missing_token".to_string(),
            message: Some("缺少 access token".to_string()),
            plan_type: None,
            usage: None,
        });
    }

    if chatgpt_account_id.is_none() {
        return Ok(UsageResult {
            status: "missing_account_id".to_string(),
            message: Some("缺少 ChatGPT account ID".to_string()),
            plan_type: None,
            usage: None,
        });
    }

    let mut client_builder = Client::builder();
    if proxy_enabled.unwrap_or(false) {
        let proxy_value = proxy_url.unwrap_or_default();
        if proxy_value.trim().is_empty() {
            return Ok(UsageResult {
                status: "error".to_string(),
                message: Some("代理已开启但代理地址为空".to_string()),
                plan_type: None,
                usage: None,
            });
        }
        let proxy = Proxy::all(&proxy_value).map_err(|e| e.to_string())?;
        client_builder = client_builder.proxy(proxy);
    }

    let client = client_builder.build().map_err(|e| e.to_string())?;

    let send_request = || {
        client
            .get("https://chatgpt.com/backend-api/wham/usage")
            .header("Authorization", format!("Bearer {}", access_token.as_deref().unwrap()))
            .header("Accept", "application/json")
            .header("ChatGPT-Account-Id", chatgpt_account_id.as_deref().unwrap())
            .send()
    };

    // 首次请求，失败后重试一次（处理网络波动等无状态码的异常）
    let response = match send_request().await {
        Ok(resp) => resp,
        Err(first_err) => {
            log::warn!("wham/usage 首次请求失败，1秒后重试: {}", first_err);
            tokio::time::sleep(std::time::Duration::from_secs(1)).await;
            match send_request().await {
                Ok(resp) => resp,
                Err(retry_err) => {
                    return Ok(UsageResult {
                        status: "error".to_string(),
                        message: Some(format!("请求失败（已重试）: {}", retry_err)),
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
        return Ok(UsageResult {
            status: "expired".to_string(),
            message: Some("Token 已过期或无效".to_string()),
            plan_type: None,
            usage: None,
        });
    }

    if status == reqwest::StatusCode::FORBIDDEN {
        return Ok(UsageResult {
            status: "forbidden".to_string(),
            message: Some("账号已被封禁或无权访问".to_string()),
            plan_type: None,
            usage: None,
        });
    }

    if !status.is_success() {
        return Ok(UsageResult {
            status: "error".to_string(),
            message: Some(format!("wham/usage 请求失败: {}", status)),
            plan_type: None,
            usage: None,
        });
    }

    let value: serde_json::Value = serde_json::from_str(&body).map_err(|e| e.to_string())?;
    let plan_type = value
        .get("plan_type")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    if let Some(plan) = plan_type.as_deref() {
        if plan == "free" {
            return Ok(UsageResult {
                status: "no_codex_access".to_string(),
                message: Some(format!("no Codex access (plan: {})", plan)),
                plan_type,
                usage: None,
            });
        }
    }

    let rate_limit_value = match value
        .get("rate_limit")
        .or_else(|| value.get("rate_limits"))
    {
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

    let (five_hour, weekly) = match parse_rate_limits(rate_limit_value) {
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
        five_hour_percent_left: five_hour.percent_left,
        five_hour_reset_time_ms: five_hour.reset_time_ms,
        weekly_percent_left: weekly.percent_left,
        weekly_reset_time_ms: weekly.reset_time_ms,
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
                        code_review_percent_left: None,
                        code_review_reset_time_ms: None,
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
            get_codex_wham_usage,
            get_usage_from_sessions,
            get_bound_usage,
            get_usage_from_file,
            get_account_usage,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
