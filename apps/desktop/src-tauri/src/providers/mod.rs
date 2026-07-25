use anyhow::Result;
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::time::Duration;

pub mod mock;
pub mod openai_compat;
pub mod sd_webui;
pub mod volcano_ark;

use crate::config::{load_config, ProviderEntry};

/// 构建 reqwest client：读取偏好里的 http_proxy 和超时配置
pub fn build_http_client() -> Result<reqwest::Client> {
    let cfg = load_config().unwrap_or_default();
    let timeout_secs = cfg
        .preferences
        .request_timeout_secs
        .unwrap_or(120)
        .max(5);
    let mut builder = reqwest::Client::builder().timeout(Duration::from_secs(timeout_secs));
    if let Some(proxy_url) = cfg
        .preferences
        .http_proxy
        .as_ref()
        .filter(|s| !s.trim().is_empty())
    {
        match reqwest::Proxy::all(proxy_url) {
            Ok(proxy) => builder = builder.proxy(proxy),
            Err(e) => eprintln!("代理 URL 无效 {proxy_url}: {e}"),
        }
    }
    Ok(builder.build()?)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ValidateResult {
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub latency_ms: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

#[derive(Debug, Clone)]
pub struct GenerateRequest {
    pub prompt: String,
    pub negative_prompt: Option<String>,
    pub size: (u32, u32),
    pub init_image: Option<String>,
    pub seed: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum GenerateEvent {
    Progress {
        percent: u32,
        message: Option<String>,
    },
    Image {
        data_url: String,
        seed: Option<u64>,
    },
    Error {
        code: String,
        message: String,
    },
    Done,
}

#[derive(Debug, Clone, Serialize)]
pub struct AvailableType {
    pub id: String,
    #[serde(rename = "displayName")]
    pub display_name: String,
    pub capabilities: Vec<String>,
}

#[async_trait]
pub trait Provider: Send + Sync {
    fn id(&self) -> &'static str;
    fn display_name(&self) -> &'static str;
    fn capabilities(&self) -> Vec<String>;
    async fn validate(&self, cfg: &ProviderEntry) -> ValidateResult;
    /// 生成一次，事件通过 emit 回调发出
    async fn generate(
        &self,
        cfg: &ProviderEntry,
        req: &GenerateRequest,
        emit: &mut (dyn FnMut(GenerateEvent) + Send),
    ) -> Result<()>;
}

pub fn get(type_id: &str) -> Option<Box<dyn Provider>> {
    match type_id {
        "mock" => Some(Box::new(mock::MockProvider)),
        "openai-compat" => Some(Box::new(openai_compat::OpenAICompatProvider)),
        "volcano-ark" => Some(Box::new(volcano_ark::VolcanoArkProvider)),
        "sd-webui" => Some(Box::new(sd_webui::SdWebuiProvider)),
        _ => None,
    }
}

pub fn list_types() -> Vec<AvailableType> {
    let providers: Vec<Box<dyn Provider>> = vec![
        Box::new(mock::MockProvider),
        Box::new(openai_compat::OpenAICompatProvider),
        Box::new(volcano_ark::VolcanoArkProvider),
        Box::new(sd_webui::SdWebuiProvider),
    ];
    providers
        .into_iter()
        .map(|p| AvailableType {
            id: p.id().to_string(),
            display_name: p.display_name().to_string(),
            capabilities: p.capabilities(),
        })
        .collect()
}
