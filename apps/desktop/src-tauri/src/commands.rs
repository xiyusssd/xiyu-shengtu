use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::ipc::Channel;
use tokio::sync::Semaphore;

use crate::config::{
    active_profile, active_profile_mut, config_path, imagegen_home, load_config, mask_key,
    save_config, Preferences, PromptTemplate, ProviderEntry,
};
use crate::history::{self, AppendItemInput, HistoryItem};
use crate::providers::{
    self, AvailableType, GenerateEvent, GenerateRequest, ValidateResult,
};

/// 面向 JS 的 provider 摘要
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderRow {
    pub id: String,
    #[serde(rename = "type")]
    pub type_: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub display_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub endpoint: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    pub has_key: bool,
    pub key_masked: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigSnapshot {
    pub active_profile: String,
    pub active_provider_id: Option<String>,
    pub config_path: String,
    pub profiles: Vec<String>,
    pub providers: Vec<ProviderRow>,
    pub available_types: Vec<AvailableType>,
}

fn to_string_err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

#[tauri::command]
pub fn read_config() -> Result<ConfigSnapshot, String> {
    let cfg = load_config().map_err(to_string_err)?;
    let profile = active_profile(&cfg).map_err(to_string_err)?;
    let providers: Vec<ProviderRow> = profile
        .providers
        .iter()
        .map(|(id, e)| ProviderRow {
            id: id.clone(),
            type_: e.type_.clone(),
            display_name: e.display_name.clone(),
            endpoint: e.endpoint.clone(),
            model: e.model.clone(),
            has_key: e.api_key.is_some(),
            key_masked: e.api_key.as_ref().map(|k| mask_key(k)),
        })
        .collect();
    Ok(ConfigSnapshot {
        active_profile: cfg.active_profile.clone(),
        active_provider_id: profile.active_provider.clone(),
        config_path: config_path().to_string_lossy().to_string(),
        profiles: cfg.profiles.keys().cloned().collect(),
        providers,
        available_types: providers::list_types(),
    })
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateProviderInput {
    pub id: String,
    #[serde(rename = "type")]
    pub type_: String,
    pub display_name: Option<String>,
    pub endpoint: Option<String>,
    pub model: Option<String>,
    pub api_key: Option<String>,
}

#[tauri::command]
pub fn create_provider(input: CreateProviderInput) -> Result<(), String> {
    if input.id.trim().is_empty() {
        return Err("id 不能为空".into());
    }
    let re_ok = input
        .id
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-'));
    if !re_ok {
        return Err("id 只允许字母数字 . _ -".into());
    }
    if providers::get(&input.type_).is_none() {
        return Err(format!("未知 provider 类型: {}", input.type_));
    }
    let mut cfg = load_config().map_err(to_string_err)?;
    let profile = active_profile_mut(&mut cfg).map_err(to_string_err)?;
    if profile.providers.contains_key(&input.id) {
        return Err(format!("id \"{}\" 已存在", input.id));
    }
    let empty_or = |s: Option<String>| s.filter(|s| !s.is_empty());
    let entry = ProviderEntry {
        type_: input.type_,
        display_name: empty_or(input.display_name),
        endpoint: empty_or(input.endpoint),
        model: empty_or(input.model),
        api_key: empty_or(input.api_key),
        extra: None,
    };
    if profile.active_provider.is_none() {
        profile.active_provider = Some(input.id.clone());
    }
    profile.providers.insert(input.id, entry);
    save_config(&cfg).map_err(to_string_err)?;
    Ok(())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateProviderInput {
    pub display_name: Option<String>,
    pub endpoint: Option<String>,
    pub model: Option<String>,
    pub api_key: Option<String>,
    pub clear_key: Option<bool>,
}

#[tauri::command]
pub fn update_provider(id: String, patch: UpdateProviderInput) -> Result<(), String> {
    let mut cfg = load_config().map_err(to_string_err)?;
    let profile = active_profile_mut(&mut cfg).map_err(to_string_err)?;
    let entry = profile
        .providers
        .get_mut(&id)
        .ok_or_else(|| format!("provider \"{id}\" 不存在"))?;
    if let Some(v) = patch.display_name {
        entry.display_name = if v.is_empty() { None } else { Some(v) };
    }
    if let Some(v) = patch.endpoint {
        entry.endpoint = if v.is_empty() { None } else { Some(v) };
    }
    if let Some(v) = patch.model {
        entry.model = if v.is_empty() { None } else { Some(v) };
    }
    if matches!(patch.clear_key, Some(true)) {
        entry.api_key = None;
    } else if let Some(k) = patch.api_key {
        if !k.is_empty() {
            entry.api_key = Some(k);
        }
    }
    save_config(&cfg).map_err(to_string_err)?;
    Ok(())
}

#[tauri::command]
pub fn delete_provider(id: String) -> Result<(), String> {
    let mut cfg = load_config().map_err(to_string_err)?;
    let profile = active_profile_mut(&mut cfg).map_err(to_string_err)?;
    if profile.providers.remove(&id).is_none() {
        return Err(format!("provider \"{id}\" 不存在"));
    }
    if profile.active_provider.as_deref() == Some(&id) {
        profile.active_provider = profile.providers.keys().next().cloned();
    }
    save_config(&cfg).map_err(to_string_err)?;
    Ok(())
}

/* ---------------- Profile 管理 ---------------- */

#[tauri::command]
pub fn list_profiles() -> Result<Vec<String>, String> {
    let cfg = load_config().map_err(to_string_err)?;
    Ok(cfg.profiles.keys().cloned().collect())
}

#[tauri::command]
pub fn create_profile(name: String) -> Result<(), String> {
    let name = name.trim().to_string();
    if name.is_empty() {
        return Err("profile 名字不能为空".into());
    }
    let mut cfg = load_config().map_err(to_string_err)?;
    if cfg.profiles.contains_key(&name) {
        return Err(format!("profile \"{name}\" 已存在"));
    }
    cfg.profiles.insert(name, Default::default());
    save_config(&cfg).map_err(to_string_err)?;
    Ok(())
}

#[tauri::command]
pub fn switch_profile(name: String) -> Result<(), String> {
    let mut cfg = load_config().map_err(to_string_err)?;
    if !cfg.profiles.contains_key(&name) {
        return Err(format!("profile \"{name}\" 不存在"));
    }
    cfg.active_profile = name;
    save_config(&cfg).map_err(to_string_err)?;
    Ok(())
}

#[tauri::command]
pub fn rename_profile(old_name: String, new_name: String) -> Result<(), String> {
    let new_name = new_name.trim().to_string();
    if new_name.is_empty() {
        return Err("新名字不能为空".into());
    }
    let mut cfg = load_config().map_err(to_string_err)?;
    if !cfg.profiles.contains_key(&old_name) {
        return Err(format!("profile \"{old_name}\" 不存在"));
    }
    if cfg.profiles.contains_key(&new_name) {
        return Err(format!("profile \"{new_name}\" 已存在"));
    }
    let data = cfg.profiles.remove(&old_name).unwrap();
    cfg.profiles.insert(new_name.clone(), data);
    if cfg.active_profile == old_name {
        cfg.active_profile = new_name;
    }
    save_config(&cfg).map_err(to_string_err)?;
    Ok(())
}

#[tauri::command]
pub fn delete_profile(name: String) -> Result<(), String> {
    let mut cfg = load_config().map_err(to_string_err)?;
    if !cfg.profiles.contains_key(&name) {
        return Err(format!("profile \"{name}\" 不存在"));
    }
    if cfg.profiles.len() <= 1 {
        return Err("至少要保留一个 profile".into());
    }
    cfg.profiles.remove(&name);
    if cfg.active_profile == name {
        cfg.active_profile = cfg
            .profiles
            .keys()
            .next()
            .cloned()
            .unwrap_or_else(|| "personal".into());
    }
    save_config(&cfg).map_err(to_string_err)?;
    Ok(())
}

/* ---------------- Provider 管理（承接原有） ---------------- */

#[tauri::command]
pub fn activate_provider(id: String) -> Result<(), String> {
    let mut cfg = load_config().map_err(to_string_err)?;
    let profile = active_profile_mut(&mut cfg).map_err(to_string_err)?;
    if !profile.providers.contains_key(&id) {
        return Err(format!("provider \"{id}\" 不存在"));
    }
    profile.active_provider = Some(id);
    save_config(&cfg).map_err(to_string_err)?;
    Ok(())
}

#[tauri::command]
pub async fn test_provider(id: String) -> Result<ValidateResult, String> {
    let cfg = load_config().map_err(to_string_err)?;
    let profile = active_profile(&cfg).map_err(to_string_err)?;
    let entry = profile
        .providers
        .get(&id)
        .ok_or_else(|| format!("provider \"{id}\" 不存在"))?
        .clone();
    let impl_ = providers::get(&entry.type_)
        .ok_or_else(|| format!("未实现 provider type: {}", entry.type_))?;
    Ok(impl_.validate(&entry).await)
}

/* ------------------ 生图 ------------------ */

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchItem {
    pub prompt: String,
    pub reference_image: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchInput {
    pub provider_id: Option<String>,
    pub items: Vec<BatchItem>,
    pub size: BatchSize,
    pub concurrency: Option<u32>,
    #[serde(default)]
    pub negative_prompt: Option<String>,
    #[serde(default)]
    pub seed: Option<u64>,
}

#[derive(Debug, Deserialize)]
pub struct BatchSize {
    pub w: u32,
    pub h: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum BatchEvent {
    BatchStart {
        total: usize,
        concurrency: u32,
    },
    TaskStart {
        #[serde(rename = "taskIndex")]
        task_index: usize,
        #[serde(rename = "hasReference")]
        has_reference: bool,
    },
    Progress {
        #[serde(rename = "taskIndex")]
        task_index: usize,
        percent: u32,
        #[serde(skip_serializing_if = "Option::is_none")]
        message: Option<String>,
    },
    Image {
        #[serde(rename = "taskIndex")]
        task_index: usize,
        #[serde(rename = "dataUrl")]
        data_url: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        seed: Option<u64>,
    },
    Error {
        #[serde(rename = "taskIndex")]
        task_index: usize,
        code: String,
        message: String,
    },
    TaskEnd {
        #[serde(rename = "taskIndex")]
        task_index: usize,
        #[serde(rename = "doneCount")]
        done_count: usize,
        total: usize,
    },
    BatchDone {
        total: usize,
        #[serde(rename = "doneCount")]
        done_count: usize,
    },
}

#[tauri::command]
pub async fn generate_batch(
    input: BatchInput,
    channel: Channel<BatchEvent>,
) -> Result<(), String> {
    let cfg = load_config().map_err(to_string_err)?;
    let profile = active_profile(&cfg).map_err(to_string_err)?;
    let provider_id = input
        .provider_id
        .clone()
        .or_else(|| profile.active_provider.clone())
        .ok_or_else(|| "no active provider".to_string())?;
    let entry = profile
        .providers
        .get(&provider_id)
        .ok_or_else(|| format!("provider \"{provider_id}\" 不存在"))?
        .clone();
    let impl_ = providers::get(&entry.type_)
        .ok_or_else(|| format!("未实现 provider type: {}", entry.type_))?;
    let impl_ = Arc::new(impl_);
    let entry = Arc::new(entry);

    let total = input.items.len();
    let concurrency = input.concurrency.unwrap_or(5).clamp(1, 10);
    let sem = Arc::new(Semaphore::new(concurrency as usize));
    let done_ctr = Arc::new(std::sync::atomic::AtomicUsize::new(0));

    let _ = channel.send(BatchEvent::BatchStart {
        total,
        concurrency,
    });

    let size = (input.size.w, input.size.h);
    let negative_prompt_shared = input
        .negative_prompt
        .as_ref()
        .filter(|s| !s.trim().is_empty())
        .cloned();
    let seed_shared = input.seed;

    // 从偏好里读重试次数
    let retry_max = load_config()
        .ok()
        .and_then(|c| c.preferences.retry_count)
        .unwrap_or(0)
        .min(3);

    let mut handles = Vec::new();
    for (idx, item) in input.items.into_iter().enumerate() {
        let negative_prompt_shared = negative_prompt_shared.clone();
        let sem = sem.clone();
        let impl_ = impl_.clone();
        let entry = entry.clone();
        let channel = channel.clone();
        let done_ctr = done_ctr.clone();
        let handle = tokio::spawn(async move {
            let _permit = sem.acquire().await.ok();
            if item.prompt.trim().is_empty() {
                let done_count = done_ctr.fetch_add(1, std::sync::atomic::Ordering::SeqCst) + 1;
                let _ = channel.send(BatchEvent::TaskEnd {
                    task_index: idx,
                    done_count,
                    total,
                });
                return;
            }
            let _ = channel.send(BatchEvent::TaskStart {
                task_index: idx,
                has_reference: item.reference_image.is_some(),
            });
            let req = GenerateRequest {
                prompt: item.prompt,
                negative_prompt: negative_prompt_shared.clone(),
                size,
                init_image: item.reference_image.clone(),
                seed: seed_shared,
            };

            // 缓存最后一次尝试的事件；只有确定不再重试时才 flush 到 channel
            let mut attempt = 0u32;
            loop {
                attempt += 1;
                let mut buffer: Vec<BatchEvent> = Vec::new();
                let mut had_image = false;
                let mut had_error: Option<(String, String)> = None;
                {
                    let mut emit = |ev: GenerateEvent| match ev {
                        GenerateEvent::Progress { percent, message } => {
                            buffer.push(BatchEvent::Progress {
                                task_index: idx,
                                percent,
                                message,
                            });
                        }
                        GenerateEvent::Image { data_url, seed } => {
                            had_image = true;
                            buffer.push(BatchEvent::Image {
                                task_index: idx,
                                data_url,
                                seed,
                            });
                        }
                        GenerateEvent::Error { code, message } => {
                            had_error = Some((code.clone(), message.clone()));
                            buffer.push(BatchEvent::Error {
                                task_index: idx,
                                code,
                                message,
                            });
                        }
                        GenerateEvent::Done => {}
                    };
                    if let Err(e) = impl_.generate(&entry, &req, &mut emit).await {
                        had_error = Some(("runtime_error".to_string(), e.to_string()));
                        buffer.push(BatchEvent::Error {
                            task_index: idx,
                            code: "runtime_error".into(),
                            message: e.to_string(),
                        });
                    }
                }

                // 成功：flush 缓冲后跳出
                if had_image && had_error.is_none() {
                    for evt in buffer {
                        let _ = channel.send(evt);
                    }
                    break;
                }
                // 失败：还能重试
                if attempt <= retry_max {
                    let _ = had_error;
                    let _ = channel.send(BatchEvent::Progress {
                        task_index: idx,
                        percent: 5,
                        message: Some(format!(
                            "重试 {} / {}",
                            attempt,
                            retry_max + 1
                        )),
                    });
                    tokio::time::sleep(std::time::Duration::from_millis(600)).await;
                    continue;
                }
                // 用尽重试：flush 最后一次的缓冲（含 error）
                for evt in buffer {
                    let _ = channel.send(evt);
                }
                break;
            }
            let done_count = done_ctr.fetch_add(1, std::sync::atomic::Ordering::SeqCst) + 1;
            let _ = channel.send(BatchEvent::TaskEnd {
                task_index: idx,
                done_count,
                total,
            });
        });
        handles.push(handle);
    }
    for h in handles {
        let _ = h.await;
    }
    let done_count = done_ctr.load(std::sync::atomic::Ordering::SeqCst);
    let _ = channel.send(BatchEvent::BatchDone { total, done_count });
    Ok(())
}

/* ---------------- 偏好设置 ---------------- */

#[tauri::command]
pub fn get_preferences() -> Result<Preferences, String> {
    let cfg = load_config().map_err(to_string_err)?;
    Ok(cfg.preferences)
}

/// 合并语义：传进来的字段有值就覆盖，None/未传就保持原样
#[tauri::command]
pub fn set_preferences(prefs: Preferences) -> Result<(), String> {
    let mut cfg = load_config().map_err(to_string_err)?;
    let existing = &mut cfg.preferences;
    if prefs.default_provider_id.is_some() {
        existing.default_provider_id = prefs.default_provider_id;
    }
    if prefs.default_size_preset.is_some() {
        existing.default_size_preset = prefs.default_size_preset;
    }
    if prefs.default_concurrency.is_some() {
        existing.default_concurrency = prefs.default_concurrency;
    }
    if prefs.theme.is_some() {
        existing.theme = prefs.theme;
    }
    if prefs.output_dir.is_some() {
        existing.output_dir = prefs.output_dir;
    }
    if prefs.http_proxy.is_some() {
        existing.http_proxy = prefs.http_proxy.filter(|s| !s.is_empty());
    }
    if prefs.request_timeout_secs.is_some() {
        existing.request_timeout_secs = prefs.request_timeout_secs;
    }
    if prefs.retry_count.is_some() {
        existing.retry_count = prefs.retry_count.map(|n| n.min(3));
    }
    save_config(&cfg).map_err(to_string_err)?;
    Ok(())
}

/* ---------------- Provider 导入 / 导出 ---------------- */

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportPayload {
    pub version: u32,
    pub exported_at: i64,
    pub profile: String,
    pub providers: std::collections::BTreeMap<String, ProviderEntry>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportInput {
    pub json: String,
    /// "merge" 保留现有，重名跳过；"overwrite" 重名覆盖；"replace" 清空后填入
    pub mode: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportResult {
    pub added: u32,
    pub overwritten: u32,
    pub skipped: u32,
}

#[tauri::command]
pub fn export_providers(include_keys: bool) -> Result<String, String> {
    let cfg = load_config().map_err(to_string_err)?;
    let profile = active_profile(&cfg).map_err(to_string_err)?;
    let mut providers: std::collections::BTreeMap<String, ProviderEntry> =
        profile.providers.clone();
    if !include_keys {
        for entry in providers.values_mut() {
            entry.api_key = None;
        }
    }
    let payload = ExportPayload {
        version: 1,
        exported_at: chrono_like_millis(),
        profile: cfg.active_profile.clone(),
        providers,
    };
    serde_json::to_string_pretty(&payload).map_err(to_string_err)
}

fn chrono_like_millis() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

#[tauri::command]
pub fn import_providers(input: ImportInput) -> Result<ImportResult, String> {
    let payload: ExportPayload =
        serde_json::from_str(&input.json).map_err(|e| format!("JSON 解析失败：{e}"))?;
    let mut cfg = load_config().map_err(to_string_err)?;
    let profile = active_profile_mut(&mut cfg).map_err(to_string_err)?;

    let mut added = 0u32;
    let mut overwritten = 0u32;
    let mut skipped = 0u32;

    let incoming = payload.providers;
    match input.mode.as_str() {
        "replace" => {
            profile.providers.clear();
            for (id, entry) in incoming {
                profile.providers.insert(id, entry);
                added += 1;
            }
        }
        "overwrite" => {
            for (id, entry) in incoming {
                if profile.providers.insert(id, entry).is_some() {
                    overwritten += 1;
                } else {
                    added += 1;
                }
            }
        }
        _ => {
            // merge 保留现有
            for (id, entry) in incoming {
                if profile.providers.contains_key(&id) {
                    skipped += 1;
                } else {
                    profile.providers.insert(id, entry);
                    added += 1;
                }
            }
        }
    }
    if profile.active_provider.is_none() {
        profile.active_provider = profile.providers.keys().next().cloned();
    }
    save_config(&cfg).map_err(to_string_err)?;
    Ok(ImportResult {
        added,
        overwritten,
        skipped,
    })
}

/* ---------------- 提示词模板 ---------------- */

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateTemplateInput {
    pub name: String,
    pub prompt: String,
    pub tags: Option<Vec<String>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateTemplateInput {
    pub name: Option<String>,
    pub prompt: Option<String>,
    pub tags: Option<Vec<String>>,
}

fn template_short_id() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    format!("tpl-{:x}", ms)
}

#[tauri::command]
pub fn list_templates() -> Result<Vec<PromptTemplate>, String> {
    let cfg = load_config().map_err(to_string_err)?;
    Ok(cfg.templates)
}

#[tauri::command]
pub fn create_template(input: CreateTemplateInput) -> Result<PromptTemplate, String> {
    if input.name.trim().is_empty() {
        return Err("名字不能为空".into());
    }
    if input.prompt.trim().is_empty() {
        return Err("提示词不能为空".into());
    }
    let mut cfg = load_config().map_err(to_string_err)?;
    let template = PromptTemplate {
        id: template_short_id(),
        name: input.name,
        prompt: input.prompt,
        tags: input.tags,
        created_at: chrono_like_millis(),
    };
    cfg.templates.insert(0, template.clone());
    save_config(&cfg).map_err(to_string_err)?;
    Ok(template)
}

#[tauri::command]
pub fn update_template(id: String, patch: UpdateTemplateInput) -> Result<(), String> {
    let mut cfg = load_config().map_err(to_string_err)?;
    let template = cfg
        .templates
        .iter_mut()
        .find(|t| t.id == id)
        .ok_or_else(|| format!("模板 \"{id}\" 不存在"))?;
    if let Some(name) = patch.name {
        template.name = name;
    }
    if let Some(prompt) = patch.prompt {
        template.prompt = prompt;
    }
    if patch.tags.is_some() {
        template.tags = patch.tags;
    }
    save_config(&cfg).map_err(to_string_err)?;
    Ok(())
}

#[tauri::command]
pub fn delete_template(id: String) -> Result<(), String> {
    let mut cfg = load_config().map_err(to_string_err)?;
    let before = cfg.templates.len();
    cfg.templates.retain(|t| t.id != id);
    if cfg.templates.len() == before {
        return Err(format!("模板 \"{id}\" 不存在"));
    }
    save_config(&cfg).map_err(to_string_err)?;
    Ok(())
}

/* ---------------- 生图历史 ---------------- */

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveHistoryInput {
    pub prompt: String,
    pub provider_id: String,
    pub provider_type: String,
    pub width: u32,
    pub height: u32,
    pub seed: Option<u64>,
    pub data_url: String,
}

#[tauri::command]
pub fn save_history_item(input: SaveHistoryInput) -> Result<HistoryItem, String> {
    history::append_item(AppendItemInput {
        prompt: input.prompt,
        provider_id: input.provider_id,
        provider_type: input.provider_type,
        width: input.width,
        height: input.height,
        seed: input.seed,
        data_url: input.data_url,
    })
    .map_err(to_string_err)
}

#[tauri::command]
pub fn list_history() -> Result<Vec<HistoryItem>, String> {
    history::list_all().map_err(to_string_err)
}

#[tauri::command]
pub fn delete_history_item(id: String) -> Result<(), String> {
    history::delete_one(&id).map_err(to_string_err)
}

#[tauri::command]
pub fn clear_history() -> Result<(), String> {
    history::clear_all().map_err(to_string_err)
}

#[tauri::command]
pub fn read_history_image(relative_path: String) -> Result<String, String> {
    history::read_as_data_url(&relative_path).map_err(to_string_err)
}

/* ---------------- 打开配置目录 ---------------- */

#[tauri::command]
pub fn open_config_folder() -> Result<String, String> {
    let dir = imagegen_home();
    let dir_str = dir.to_string_lossy().to_string();
    #[cfg(target_os = "macos")]
    {
        let _ = std::process::Command::new("open").arg(&dir).spawn();
    }
    #[cfg(target_os = "windows")]
    {
        let _ = std::process::Command::new("explorer").arg(&dir).spawn();
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let _ = std::process::Command::new("xdg-open").arg(&dir).spawn();
    }
    Ok(dir_str)
}
