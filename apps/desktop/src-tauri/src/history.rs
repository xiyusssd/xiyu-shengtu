//! 生图历史：图片存到 ~/.imagegen/images/，元数据用 JSON 索引
use anyhow::{Context, Result};
use base64::{engine::general_purpose::STANDARD, Engine};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::config::{ensure_dirs, imagegen_home, images_dir};

const HISTORY_INDEX_FILE: &str = "history.json";
const MAX_HISTORY_ITEMS: usize = 500;

/// 保护 history.json 的 read-modify-write，避免并发批量保存丢条目
static HISTORY_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryItem {
    pub id: String,
    pub prompt: String,
    pub provider_id: String,
    pub provider_type: String,
    pub width: u32,
    pub height: u32,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub seed: Option<u64>,
    /// 相对于 ~/.imagegen/ 的路径
    pub relative_path: String,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct HistoryIndex {
    #[serde(default)]
    items: Vec<HistoryItem>,
}

fn index_path() -> PathBuf {
    imagegen_home().join(HISTORY_INDEX_FILE)
}

fn load_index() -> Result<HistoryIndex> {
    ensure_dirs()?;
    let path = index_path();
    if !path.exists() {
        return Ok(HistoryIndex::default());
    }
    let raw = fs::read_to_string(&path)
        .with_context(|| format!("读取 {} 失败", path.display()))?;
    Ok(serde_json::from_str(&raw).unwrap_or_default())
}

fn save_index(idx: &HistoryIndex) -> Result<()> {
    ensure_dirs()?;
    let path = index_path();
    // tmp 名带 pid 避免多写者共享同一临时文件
    let tmp = path.with_extension(format!("json.{}.tmp", std::process::id()));
    let json = serde_json::to_string_pretty(idx)?;
    fs::write(&tmp, json)?;
    fs::rename(&tmp, &path)?;
    Ok(())
}

fn now_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn short_id() -> String {
    // uuid v4 保证跨线程/毫秒不碰撞
    format!("{:x}-{}", now_millis(), uuid::Uuid::new_v4().simple())
}

fn extract_extension(mime_or_url: &str) -> &str {
    if mime_or_url.contains("svg") {
        "svg"
    } else if mime_or_url.contains("jpeg") || mime_or_url.contains("jpg") {
        "jpg"
    } else if mime_or_url.contains("webp") {
        "webp"
    } else {
        "png"
    }
}

fn decode_data_url(data_url: &str) -> Result<(Vec<u8>, String)> {
    if let Some(rest) = data_url.strip_prefix("data:") {
        if let Some((meta, b64)) = rest.split_once(',') {
            let mime = meta.split(';').next().unwrap_or("image/png").to_string();
            let bytes = STANDARD.decode(b64)?;
            return Ok((bytes, mime));
        }
    }
    Ok((STANDARD.decode(data_url)?, "image/png".to_string()))
}

pub struct AppendItemInput {
    pub prompt: String,
    pub provider_id: String,
    pub provider_type: String,
    pub width: u32,
    pub height: u32,
    pub seed: Option<u64>,
    pub data_url: String,
}

pub fn append_item(input: AppendItemInput) -> Result<HistoryItem> {
    ensure_dirs()?;
    let (bytes, mime) = decode_data_url(&input.data_url)?;
    let extension = extract_extension(&mime);
    let id = short_id();
    let filename = format!("{id}.{extension}");
    let full_path = images_dir().join(&filename);
    fs::write(&full_path, bytes)
        .with_context(|| format!("写入 {} 失败", full_path.display()))?;

    let item = HistoryItem {
        id: id.clone(),
        prompt: input.prompt,
        provider_id: input.provider_id,
        provider_type: input.provider_type,
        width: input.width,
        height: input.height,
        seed: input.seed,
        relative_path: format!("images/{filename}"),
        created_at: now_millis(),
    };

    // 加锁：保护 load→insert→save 的原子性，防并发批量保存互相覆盖
    let _guard = HISTORY_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let mut idx = load_index()?;
    idx.items.insert(0, item.clone());
    if idx.items.len() > MAX_HISTORY_ITEMS {
        // 删掉多余的对应图片，避免磁盘无限增长
        let to_prune: Vec<HistoryItem> = idx.items.split_off(MAX_HISTORY_ITEMS);
        for extra in to_prune {
            let extra_path = imagegen_home().join(extra.relative_path);
            let _ = fs::remove_file(extra_path);
        }
    }
    save_index(&idx)?;
    Ok(item)
}

pub fn list_all() -> Result<Vec<HistoryItem>> {
    Ok(load_index()?.items)
}

pub fn delete_one(id: &str) -> Result<()> {
    let mut idx = load_index()?;
    if let Some(pos) = idx.items.iter().position(|i| i.id == id) {
        let removed = idx.items.remove(pos);
        let path = imagegen_home().join(&removed.relative_path);
        let _ = fs::remove_file(path);
        save_index(&idx)?;
    }
    Ok(())
}

pub fn clear_all() -> Result<()> {
    let idx = load_index()?;
    for item in &idx.items {
        let path = imagegen_home().join(&item.relative_path);
        let _ = fs::remove_file(path);
    }
    save_index(&HistoryIndex::default())?;
    Ok(())
}

/// 读取图片文件并返回 data URL（供前端展示）
pub fn read_as_data_url(relative_path: &str) -> Result<String> {
    let path = imagegen_home().join(relative_path);
    let bytes = fs::read(&path)
        .with_context(|| format!("读取 {} 失败", path.display()))?;
    let mime = match path.extension().and_then(|s| s.to_str()) {
        Some("svg") => "image/svg+xml",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("webp") => "image/webp",
        _ => "image/png",
    };
    let b64 = STANDARD.encode(&bytes);
    Ok(format!("data:{mime};base64,{b64}"))
}
