//! AUTOMATIC1111 Stable Diffusion WebUI Provider
//! 接 `/sdapi/v1/txt2img` 和 `/sdapi/v1/img2img`

use anyhow::{anyhow, Result};
use async_trait::async_trait;
use base64::{engine::general_purpose::STANDARD, Engine};
use serde::Deserialize;
use std::time::{Duration, Instant};

use super::{GenerateEvent, GenerateRequest, Provider, ValidateResult};
use crate::config::ProviderEntry;

pub struct SdWebuiProvider;

#[derive(Debug, Deserialize)]
struct SdResponse {
    #[serde(default)]
    images: Vec<String>,
    #[serde(default)]
    info: Option<String>,
    #[serde(default)]
    error: Option<String>,
    #[serde(default)]
    errors: Option<String>,
}

fn join_url(base: &str, path: &str) -> String {
    let base_trimmed = base.trim_end_matches('/');
    let path_trimmed = path.trim_start_matches('/');
    format!("{base_trimmed}/{path_trimmed}")
}

/// data URL 或裸 base64 → 纯 base64（去掉 data:xxx;base64, 前缀）
fn to_bare_base64(data_url: &str) -> String {
    if let Some(rest) = data_url.strip_prefix("data:") {
        if let Some((_, b64)) = rest.split_once(',') {
            return b64.to_string();
        }
    }
    data_url.to_string()
}

async fn build_client() -> Result<reqwest::Client> {
    super::build_http_client()
}

fn add_auth(
    builder: reqwest::RequestBuilder,
    entry: &ProviderEntry,
) -> reqwest::RequestBuilder {
    match entry.api_key.as_deref() {
        Some(key) if !key.is_empty() => builder.bearer_auth(key),
        _ => builder,
    }
}

#[async_trait]
impl Provider for SdWebuiProvider {
    fn id(&self) -> &'static str {
        "sd-webui"
    }
    fn display_name(&self) -> &'static str {
        "Stable Diffusion WebUI（AUTOMATIC1111）"
    }
    fn capabilities(&self) -> Vec<String> {
        vec!["text2img".into(), "img2img".into()]
    }

    async fn validate(&self, cfg: &ProviderEntry) -> ValidateResult {
        let Some(endpoint) = cfg.endpoint.as_ref() else {
            return ValidateResult {
                ok: false,
                latency_ms: None,
                message: Some("缺少 endpoint（例：http://127.0.0.1:7860）".into()),
            };
        };
        let started = Instant::now();
        let client = match build_client().await {
            Ok(c) => c,
            Err(e) => {
                return ValidateResult {
                    ok: false,
                    latency_ms: None,
                    message: Some(format!("client 构建失败: {e}")),
                };
            }
        };
        // /sdapi/v1/options 通用，不消耗算力
        let url = join_url(endpoint, "/sdapi/v1/options");
        let req = add_auth(client.get(&url), cfg).timeout(Duration::from_secs(6));
        match req.send().await {
            Ok(res) => {
                let latency_ms = Some(started.elapsed().as_millis() as u64);
                if res.status().is_success() {
                    ValidateResult {
                        ok: true,
                        latency_ms,
                        message: Some("OK".into()),
                    }
                } else {
                    let status = res.status();
                    let text = res.text().await.unwrap_or_default();
                    ValidateResult {
                        ok: false,
                        latency_ms,
                        message: Some(format!(
                            "HTTP {} {}",
                            status,
                            text.chars().take(200).collect::<String>()
                        )),
                    }
                }
            }
            Err(e) => ValidateResult {
                ok: false,
                latency_ms: Some(started.elapsed().as_millis() as u64),
                message: Some(e.to_string()),
            },
        }
    }

    async fn generate(
        &self,
        cfg: &ProviderEntry,
        req: &GenerateRequest,
        emit: &mut (dyn FnMut(GenerateEvent) + Send),
    ) -> Result<()> {
        let endpoint = cfg
            .endpoint
            .as_ref()
            .ok_or_else(|| anyhow!("缺少 endpoint"))?;

        let use_img2img = req.init_image.is_some();
        emit(GenerateEvent::Progress {
            percent: 5,
            message: Some(if use_img2img {
                "已发起 img2img 请求".into()
            } else {
                "已发起 txt2img 请求".into()
            }),
        });

        let client = build_client().await?;
        let mut body = serde_json::json!({
            "prompt": req.prompt,
            "width": req.size.0,
            "height": req.size.1,
            "steps": 20,
            "cfg_scale": 7.0,
            "sampler_name": "Euler a",
            "batch_size": 1,
        });
        if let Some(neg) = req.negative_prompt.as_ref() {
            body["negative_prompt"] = serde_json::Value::String(neg.clone());
        }
        if let Some(seed) = req.seed {
            body["seed"] = serde_json::Value::Number(seed.into());
        }
        if let Some(model) = cfg.model.as_ref() {
            body["override_settings"] = serde_json::json!({
                "sd_model_checkpoint": model,
            });
        }

        let url = if use_img2img {
            body["init_images"] = serde_json::Value::Array(vec![
                serde_json::Value::String(to_bare_base64(req.init_image.as_ref().unwrap())),
            ]);
            body["denoising_strength"] = serde_json::Value::from(0.75);
            join_url(endpoint, "/sdapi/v1/img2img")
        } else {
            join_url(endpoint, "/sdapi/v1/txt2img")
        };

        let request_builder = add_auth(client.post(&url).json(&body), cfg);
        let response = request_builder.send().await?;

        emit(GenerateEvent::Progress {
            percent: 60,
            message: Some("SD-WebUI 已响应".into()),
        });

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            emit(GenerateEvent::Error {
                code: format!("http_{}", status.as_u16()),
                message: text.chars().take(500).collect::<String>(),
            });
            return Ok(());
        }

        let parsed: SdResponse = response.json().await?;
        if let Some(err_msg) = parsed.error.or(parsed.errors) {
            emit(GenerateEvent::Error {
                code: "sd_error".into(),
                message: err_msg,
            });
            return Ok(());
        }
        if parsed.images.is_empty() {
            emit(GenerateEvent::Error {
                code: "empty_response".into(),
                message: "SD-WebUI 未返回图片".into(),
            });
            return Ok(());
        }

        emit(GenerateEvent::Progress {
            percent: 90,
            message: Some("解析图片".into()),
        });

        // 从 info 里尝试挖 seed
        let seed_out = parsed
            .info
            .as_ref()
            .and_then(|info| {
                serde_json::from_str::<serde_json::Value>(info)
                    .ok()
                    .and_then(|v| v.get("seed").and_then(|s| s.as_u64()))
            })
            .or(req.seed);

        for b64 in parsed.images {
            let cleaned = to_bare_base64(&b64);
            // 校验一下是不是合法 base64（防止后端返回错误字符串）
            if STANDARD.decode(&cleaned).is_err() {
                continue;
            }
            emit(GenerateEvent::Image {
                data_url: format!("data:image/png;base64,{cleaned}"),
                seed: seed_out,
            });
        }

        emit(GenerateEvent::Progress {
            percent: 100,
            message: None,
        });
        emit(GenerateEvent::Done);
        Ok(())
    }
}
