//! 火山方舟（Volcengine ARK）· 豆包生图
//! POST {endpoint}/api/v3/images/generations
//! 与 OpenAI 相似的接口，但字段有差异（size 用 "1024x1024" 字符串，n=1，返回 url 或 b64_json）

use anyhow::{anyhow, Result};
use async_trait::async_trait;
use base64::{engine::general_purpose::STANDARD, Engine};
use serde::Deserialize;
use std::time::{Duration, Instant};

use super::{GenerateEvent, GenerateRequest, Provider, ValidateResult};
use crate::config::ProviderEntry;

pub struct VolcanoArkProvider;

#[derive(Debug, Deserialize)]
struct VolcanoImageItem {
    #[serde(default)]
    b64_json: Option<String>,
    #[serde(default)]
    url: Option<String>,
}

#[derive(Debug, Deserialize)]
struct VolcanoImageResponse {
    #[serde(default)]
    data: Option<Vec<VolcanoImageItem>>,
    #[serde(default)]
    error: Option<VolcanoError>,
}

#[derive(Debug, Deserialize)]
struct VolcanoError {
    #[serde(default)]
    message: Option<String>,
    #[serde(default)]
    code: Option<String>,
}

const DEFAULT_ENDPOINT: &str = "https://ark.cn-beijing.volces.com/api/v3";

fn join_url(base: &str, path: &str) -> String {
    let base_trimmed = base.trim_end_matches('/');
    let path_trimmed = path.trim_start_matches('/');
    format!("{base_trimmed}/{path_trimmed}")
}

async fn fetch_image_as_data_url(client: &reqwest::Client, url: &str) -> Result<String> {
    let res = client.get(url).send().await?;
    let content_type = res
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("image/png")
        .to_string();
    let bytes = res.bytes().await?;
    let b64 = STANDARD.encode(&bytes);
    Ok(format!("data:{content_type};base64,{b64}"))
}

async fn build_client() -> Result<reqwest::Client> {
    super::build_http_client()
}

fn endpoint_of(cfg: &ProviderEntry) -> String {
    cfg.endpoint
        .clone()
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| DEFAULT_ENDPOINT.to_string())
}

#[async_trait]
impl Provider for VolcanoArkProvider {
    fn id(&self) -> &'static str {
        "volcano-ark"
    }
    fn display_name(&self) -> &'static str {
        "火山方舟（豆包生图 · doubao-seedream）"
    }
    fn capabilities(&self) -> Vec<String> {
        vec!["text2img".into()]
    }

    async fn validate(&self, cfg: &ProviderEntry) -> ValidateResult {
        let Some(api_key) = cfg.api_key.as_ref() else {
            return ValidateResult {
                ok: false,
                latency_ms: None,
                message: Some("缺少 apiKey".into()),
            };
        };
        let Some(model) = cfg.model.as_ref() else {
            return ValidateResult {
                ok: false,
                latency_ms: None,
                message: Some("缺少 model（例：doubao-seedream-3-0-t2i-250415）".into()),
            };
        };
        let endpoint = endpoint_of(cfg);
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
        let url = join_url(&endpoint, "/images/generations");
        let body = serde_json::json!({
            "model": model,
            "prompt": "a small red dot on white background",
            "size": "1024x1024",
            "n": 1,
        });
        let res = client
            .post(&url)
            .bearer_auth(api_key)
            .json(&body)
            .timeout(Duration::from_secs(20))
            .send()
            .await;
        let latency_ms = Some(started.elapsed().as_millis() as u64);
        match res {
            Ok(r) => {
                if !r.status().is_success() {
                    let status = r.status();
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
                match r.json::<VolcanoImageResponse>().await {
                    Ok(parsed) => {
                        if let Some(err) = parsed.error {
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
        let api_key = cfg
            .api_key
            .as_ref()
            .ok_or_else(|| anyhow!("缺少 apiKey"))?;
        let model = cfg.model.as_ref().ok_or_else(|| anyhow!("缺少 model"))?;
        let endpoint = endpoint_of(cfg);

        emit(GenerateEvent::Progress {
            percent: 5,
            message: Some("已发起火山方舟请求".into()),
        });

        let client = build_client().await?;
        let url = join_url(&endpoint, "/images/generations");
        let mut body = serde_json::json!({
            "model": model,
            "prompt": req.prompt,
            "size": format!("{}x{}", req.size.0, req.size.1),
            "n": 1,
            "response_format": "b64_json",
        });
        if let Some(seed) = req.seed {
            body["seed"] = serde_json::Value::Number(seed.into());
        }
        // 火山方舟不支持 negative_prompt，直接忽略

        let response = client
            .post(&url)
            .bearer_auth(api_key)
            .json(&body)
            .send()
            .await?;

        emit(GenerateEvent::Progress {
            percent: 60,
            message: Some("方舟已响应".into()),
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

        let parsed: VolcanoImageResponse = response.json().await?;
        if let Some(err) = parsed.error {
            emit(GenerateEvent::Error {
                code: err.code.unwrap_or_else(|| "provider_error".into()),
                message: err
                    .message
                    .unwrap_or_else(|| "unknown provider error".into()),
            });
            return Ok(());
        }
        let items = match parsed.data {
            Some(d) if !d.is_empty() => d,
            _ => {
                emit(GenerateEvent::Error {
                    code: "empty_response".into(),
                    message: "方舟未返回图片".into(),
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
                format!("data:image/png;base64,{b64}")
            } else if let Some(url) = item.url {
                match fetch_image_as_data_url(&client, &url).await {
                    Ok(d) => d,
                    Err(e) => {
                        emit(GenerateEvent::Error {
                            code: "fetch_image_failed".into(),
                            message: e.to_string(),
                        });
                        continue;
                    }
                }
            } else {
                continue;
            };
            emit(GenerateEvent::Image {
                data_url,
                seed: req.seed,
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
