use anyhow::Result;
use async_trait::async_trait;
use base64::{engine::general_purpose::STANDARD, Engine};

use super::{GenerateEvent, GenerateRequest, Provider, ValidateResult};
use crate::config::ProviderEntry;

pub struct MockProvider;

fn escape_xml(text: &str) -> String {
    text.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

fn placeholder_svg(w: u32, h: u32, prompt: &str, init_image: Option<&str>) -> String {
    let safe = escape_xml(prompt);
    let safe: String = safe.chars().take(80).collect();
    let bg = match init_image {
        Some(url) => format!(
            r#"<image href="{}" width="{w}" height="{h}" preserveAspectRatio="xMidYMid slice"/>
       <rect width="100%" height="100%" fill="url(#g)" opacity="0.55"/>"#,
            escape_xml(url)
        ),
        None => r#"<rect width="100%" height="100%" fill="url(#g)"/>"#.to_string(),
    };
    let tag = if init_image.is_some() {
        "Mock · img2img"
    } else {
        "Mock · text2img"
    };
    let font_1 = (w / 22).max(14);
    let font_2 = (w / 34).max(10);
    let svg = format!(
        r##"<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#4f46e5"/>
      <stop offset="1" stop-color="#ec4899"/>
    </linearGradient>
  </defs>
  {bg}
  <text x="50%" y="46%" text-anchor="middle" fill="#fff" font-size="{font_1}" font-family="-apple-system,Helvetica,Arial,sans-serif" style="paint-order:stroke;stroke:rgba(0,0,0,0.4);stroke-width:2">{tag}</text>
  <text x="50%" y="58%" text-anchor="middle" fill="#fff" opacity="0.9" font-size="{font_2}" font-family="-apple-system,Helvetica,Arial,sans-serif" style="paint-order:stroke;stroke:rgba(0,0,0,0.4);stroke-width:1.5">{safe}</text>
</svg>"##
    );
    let b64 = STANDARD.encode(svg.as_bytes());
    format!("data:image/svg+xml;base64,{b64}")
}

#[async_trait]
impl Provider for MockProvider {
    fn id(&self) -> &'static str {
        "mock"
    }
    fn display_name(&self) -> &'static str {
        "Mock（占位）"
    }
    fn capabilities(&self) -> Vec<String> {
        vec!["text2img".into(), "img2img".into()]
    }
    async fn validate(&self, _cfg: &ProviderEntry) -> ValidateResult {
        ValidateResult {
            ok: true,
            latency_ms: Some(1),
            message: Some("mock 永远通".to_string()),
        }
    }
    async fn generate(
        &self,
        _cfg: &ProviderEntry,
        req: &GenerateRequest,
        emit: &mut (dyn FnMut(GenerateEvent) + Send),
    ) -> Result<()> {
        for p in [10u32, 30, 55, 80, 100] {
            tokio::time::sleep(std::time::Duration::from_millis(200)).await;
            emit(GenerateEvent::Progress {
                percent: p,
                message: Some(format!("mock 步进 {p}%")),
            });
        }
        let (w, h) = req.size;
        let seed = req.seed.unwrap_or_else(|| rand_u32() as u64);
        emit(GenerateEvent::Image {
            data_url: placeholder_svg(w, h, &req.prompt, req.init_image.as_deref()),
            seed: Some(seed),
        });
        emit(GenerateEvent::Done);
        Ok(())
    }
}

fn rand_u32() -> u32 {
    // 简单伪随机，不需要密码学强度
    use std::time::{SystemTime, UNIX_EPOCH};
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    (now as u32).wrapping_mul(2654435761)
}
