use std::fs;
use std::path::PathBuf;
use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader};

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
    pub five_hour_reset_time: String,
    pub weekly_percent_left: f64,
    pub weekly_reset_time: String,
    pub last_updated: String,
}

/// 获取 codex sessions 目录路径
fn get_codex_sessions_dir() -> Result<PathBuf, String> {
    dirs::home_dir()
        .map(|p| p.join(".codex").join("sessions"))
        .ok_or_else(|| "Cannot find home directory".to_string())
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
    
    // 格式化重置时间
    let five_hour_reset = format_reset_time(primary.resets_at);
    let weekly_reset = format_reset_time_with_date(secondary.resets_at);
    
    Ok(UsageData {
        five_hour_percent_left: 100.0 - primary.used_percent,
        five_hour_reset_time: five_hour_reset,
        weekly_percent_left: 100.0 - secondary.used_percent,
        weekly_reset_time: weekly_reset,
        last_updated: chrono_now(),
    })
}

/// 格式化时间戳为时间字符串 (HH:MM)
fn format_reset_time(timestamp: i64) -> String {
    use std::time::{UNIX_EPOCH, Duration};
    
    let reset_time = UNIX_EPOCH + Duration::from_secs(timestamp as u64);
    
    // 简单计算小时和分钟
    if let Ok(duration) = reset_time.duration_since(UNIX_EPOCH) {
        let secs = duration.as_secs();
        let hours = (secs / 3600) % 24;
        let minutes = (secs / 60) % 60;
        
        // 调整为本地时区（简化处理，假设 UTC+8）
        let local_hours = (hours + 8) % 24;
        return format!("{:02}:{:02}", local_hours, minutes);
    }
    
    "--:--".to_string()
}

/// 格式化时间戳为日期时间字符串
fn format_reset_time_with_date(timestamp: i64) -> String {
    use std::time::{UNIX_EPOCH, Duration};
    
    let reset_time = UNIX_EPOCH + Duration::from_secs(timestamp as u64);
    
    if let Ok(duration) = reset_time.duration_since(UNIX_EPOCH) {
        let secs = duration.as_secs();
        
        // 简化的日期计算
        let days_since_epoch = secs / 86400;
        let day_of_week = ((days_since_epoch + 4) % 7) as u8; // 1970-01-01 was Thursday (4)
        
        let weekday = match day_of_week {
            0 => "周日",
            1 => "周一",
            2 => "周二",
            3 => "周三",
            4 => "周四",
            5 => "周五",
            6 => "周六",
            _ => "未知",
        };
        
        let hours = (secs / 3600) % 24;
        let minutes = (secs / 60) % 60;
        let local_hours = (hours + 8) % 24;
        
        return format!("{} {:02}:{:02}", weekday, local_hours, minutes);
    }
    
    "未知".to_string()
}

/// 获取当前时间字符串
fn chrono_now() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    
    if let Ok(duration) = SystemTime::now().duration_since(UNIX_EPOCH) {
        let secs = duration.as_secs();
        let millis = duration.subsec_millis();
        return format!("{}000", secs).replace("000", &format!("{:03}", millis));
    }
    
    "0".to_string()
}

/// 获取账号的用量信息（通过解析本地 session 日志）
#[tauri::command]
fn get_usage_from_sessions() -> Result<UsageData, String> {
    let latest_file = find_latest_session_file()?;
    parse_rate_limits_from_file(&latest_file)
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
            
            // 检查是否包含目标账号邮箱
            if line.contains(&account_email) {
                found_account = true;
            }
            
            // 解析 rate_limits
            if let Ok(event) = serde_json::from_str::<EventMsg>(&line) {
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
                    return Ok(UsageData {
                        five_hour_percent_left: 100.0 - primary.used_percent,
                        five_hour_reset_time: format_reset_time(primary.resets_at),
                        weekly_percent_left: 100.0 - secondary.used_percent,
                        weekly_reset_time: format_reset_time_with_date(secondary.resets_at),
                        last_updated: chrono_now(),
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
            get_account_usage,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
