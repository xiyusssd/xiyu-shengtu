use anyhow::{anyhow, Result};
use async_trait::async_trait;
use base64::{engine::general_purpose::STANDARD, Engine};
use reqwest::multipart::{Form, Part};
use serde::Deserialize;
use std::time::{Duration, Instant};

use super::{GenerateEvent, GenerateRequest, Provider, ValidateResult};
use crate::config::ProviderEntry;

pub struct OpenAICompatProvider;

#[derive(Debug, Deserialize)]
struct OpenAIImageItem {
    #[serde(default)]
    b64_json: Option<String>,
    #[serde(default)]
    url: Option<String>,
    #[serde(default)]
    revised_prompt: Option<String>,
}

#[derive(Debug, Deserialize)]
struct OpenAIImageResponse {
    #[serde(default)]
    data: Option<Vec<OpenAIImageItem>>,
    #[serde(default)]
    error: Option<OpenAIError>,
}

#[derive(Debug, Deserialize)]
struct OpenAIError {
    #[serde(default)]
    message: Option<String>,
    #[serde(default)]
    code: Option<String>,
}

fn join_url(base: &str, path: &str) -> String {
    let b = base.trim_end_matches('/');
    let p = path.trim_start_matches('/');
    format!("{b}/{p}")
}

/// data URL 或裸 base64 → (bytes, mime)
fn decode_data_url(s: &str) -> Result<(Vec<u8>, String)> {
    if let Some(rest) = s.strip_prefix("data:") {
        if let Some((meta, b64)) = rest.split_once(",") {
            let mime = meta.split(';').next().unwrap_or("image/png").to_string();
            let bytes = STANDARD.decode(b64)?;
            return Ok((bytes, mime));
        }
    }
    // 裸 base64
    let bytes = STANDARD.decode(s)?;
    Ok((bytes, "image/png".to_string()))
}

async fn client() -> Result<reqwest::Client> {
    super::build_http_client()
}

#[async_trait]
impl Provider for OpenAICompatProvider {
    fn id(&self) -> &'static str {
        "openai-compat"
    }
    fn display_name(&self) -> &'static str {
        "OpenAI 兼容（含 One-API / New-API / 硅基流动）"
    }
    fn capabilities(&self) -> Vec<String> {
        vec!["text2img".into(), "img2img".into()]
    }
    async fn validate(&self, cfg: &ProviderEntry) -> ValidateResult {
        let (Some(endpoint), Some(model), Some(api_key)) =
            (cfg.endpoint.as_ref(), cfg.model.as_ref(), cfg.api_key.as_ref())
        else {
            return ValidateResult {
                ok: false,
                latency_ms: None,
                message: Some("缺少 endpoint / model / apiKey".into()),
            };
        };
        let t0 = Instant::now();
        let url = join_url(endpoint, "/images/generations");
        let client = match client().await {
            Ok(c) => c,
            Err(e) => {
                return ValidateResult {
                    ok: false,
                    latency_ms: None,
                    message: Some(format!("client 构建失败: {e}")),
                };
            }
        };
        let body = serde_json::json!({
            "model": model,
            "prompt": "a small red dot on white background",
            "n": 1,
            "size": "1024x1024",
        });
        let resp = client
            .post(&url)
            .bearer_auth(api_key)
            .json(&body)
            .timeout(Duration::from_secs(15))
            .send()
            .await;
        let latency_ms = Some(t0.elapsed().as_millis() as u64);
        match resp {
            Ok(r) => {
                let status = r.status();
                if !status.is_success() {
                    let text = r.text().await.unwrap_or_default();
                    return ValidateResult {
                        ok: false,
                        latency_ms,
                        message: Some(format!(
                            "HTTP {} {}",
                            status,
                            text.chars().take(200).collect::<String>()
                        )),
                    };
                }
                let json: Result<OpenAIImageResponse, _> = r.json().await;
                match json {
                    Ok(j) => {
                        if let Some(err) = j.error {
                            return ValidateResult {
                                ok: false,
                                latency_ms,
                                message: err.message.or(Some("unknown error".into())),
                            };
                        }
                        ValidateResult {
                            ok: true,
                            latency_ms,
                            message: Some("OK".into()),
                        }
                    }
                    Err(e) => ValidateResult {
                        ok: false,
                        latency_ms,
                        message: Some(format!("解析响应失败: {e}")),
                    },
                }
            }
            Err(e) => ValidateResult {
                ok: false,
                latency_ms,
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
        let model = cfg.model.as_ref().ok_or_else(|| anyhow!("缺少 model"))?;
        let api_key = cfg
            .api_key
            .as_ref()
            .ok_or_else(|| anyhow!("缺少 apiKey"))?;

        let use_img2img = req.init_image.is_some();
        emit(GenerateEvent::Progress {
            percent: 5,
            message: Some(if use_img2img {
                "已发起 img2img 请求".into()
            } else {
                "已发起请求".into()
            }),
        });

        let client = client().await?;
        let response = if use_img2img {
            let url = join_url(endpoint, "/images/edits");
            let (bytes, mime) = decode_data_url(req.init_image.as_ref().unwrap())?;
            let part = Part::bytes(bytes)
                .file_name("reference.png")
                .mime_str(&mime)
                .unwrap_or_else(|_| Part::bytes(vec![]).file_name("reference.png"));
            let form = Form::new()
                .text("model", model.clone())
                .text("prompt", req.prompt.clone())
                .text("n", "1")
                .text("size", format!("{}x{}", req.size.0, req.size.1))
                .part("image", part);
            client
                .post(&url)
                .bearer_auth(api_key)
                .multipart(form)
                .send()
                .await?
        } else {
            let url = join_url(endpoint, "/images/generations");
            let mut body = serde_json::json!({
                "model": model,
                "prompt": req.prompt,
                "n": 1,
                "size": format!("{}x{}", req.size.0, req.size.1),
                "response_format": "b64_json",
            });
            if let Some(neg) = req.negative_prompt.as_ref() {
                body["negative_prompt"] = serde_json::Value::String(neg.clone());
            }
            if let Some(seed) = req.seed {
                body["seed"] = serde_json::Value::Number(seed.into());
            }
            client
                .post(&url)
                .bearer_auth(api_key)
                .json(&body)
                .send()
                .await?
        };

        emit(GenerateEvent::Progress {
            percent: 60,
            message: Some("服务端已响应".into()),
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
        let json: OpenAIImageResponse = response.json().await?;
        if let Some(err) = json.error {
            emit(GenerateEvent::Error {
                code: err.code.unwrap_or_else(|| "provider_error".into()),
                message: err
                    .message
                    .unwrap_or_else(|| "unknown provider error".into()),
            });
            return Ok(());
        }
        let items = match json.data {
            Some(d) if !d.is_empty() => d,
            _ => {
                emit(GenerateEvent::Error {
                    code: "empty_response".into(),
                    message: "无图片数据返回".into(),
                });
                return Ok(());
            }
        };

        emit(GenerateEvent::Progress {
            percent: 90,
            message: Some("解析图片".into()),
        });

        for item in items {
            let data_url = if let Some(b64) = item.b64_json {
                format!("data:image/png;base64,{}", b64)
            } else if let Some(url) = item.url {
                let resp = client.get(&url).send().await?;
                let ct = resp
                    .headers()
                    .get(reqwest::header::CONTENT_TYPE)
                    .and_then(|v| v.to_str().ok())
                    .unwrap_or("image/png")
                    .to_string();
                let bytes = resp.bytes().await?;
                let b64 = STANDARD.encode(&bytes);
                format!("data:{ct};base64,{b64}")
            } else {
                continue;
            };
            emit(GenerateEvent::Image {
                data_url,
                seed: None,
            });
            let _ = item.revised_prompt; // 备用
        }
        emit(GenerateEvent::Progress {
            percent: 100,
            message: None,
        });
        emit(GenerateEvent::Done);
        Ok(())
    }
}
