use anyhow::{anyhow, Context, Result};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs;
use std::path::PathBuf;

/// ~/.imagegen/ 目录及内部文件
pub fn imagegen_home() -> PathBuf {
    if let Ok(env) = std::env::var("IMAGEGEN_HOME") {
        return PathBuf::from(env);
    }
    let mut p = dirs::home_dir().expect("no home dir");
    p.push(".imagegen");
    p
}

pub fn config_path() -> PathBuf {
    imagegen_home().join("config.json")
}

pub fn images_dir() -> PathBuf {
    imagegen_home().join("images")
}

pub fn logs_dir() -> PathBuf {
    imagegen_home().join("logs")
}

pub fn ensure_dirs() -> Result<()> {
    for dir in [imagegen_home(), images_dir(), logs_dir()] {
        fs::create_dir_all(&dir)
            .with_context(|| format!("创建目录失败: {}", dir.display()))?;
    }
    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ProviderEntry {
    #[serde(rename = "type")]
    pub type_: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub display_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub endpoint: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub model: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default, alias = "api_key")]
    pub api_key: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub extra: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ProfileData {
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub active_provider: Option<String>,
    #[serde(default)]
    pub providers: BTreeMap<String, ProviderEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Preferences {
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub default_provider_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub default_size_preset: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub default_concurrency: Option<u32>,
    /// "light" | "dark" | "system"
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub theme: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub output_dir: Option<String>,
    /// HTTP 代理，例如 http://127.0.0.1:7890 或 socks5://127.0.0.1:1080
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub http_proxy: Option<String>,
    /// 请求超时秒数（默认 120）
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub request_timeout_secs: Option<u64>,
    /// 生图失败自动重试次数（默认 0，最大 3）
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub retry_count: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PromptTemplate {
    pub id: String,
    pub name: String,
    pub prompt: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub tags: Option<Vec<String>>,
    #[serde(default)]
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub version: u32,
    pub active_profile: String,
    pub profiles: BTreeMap<String, ProfileData>,
    #[serde(default)]
    pub preferences: Preferences,
    #[serde(default)]
    pub templates: Vec<PromptTemplate>,
}

impl Default for AppConfig {
    fn default() -> Self {
        let mut profiles = BTreeMap::new();
        profiles.insert("personal".to_string(), ProfileData::default());
        Self {
            version: 1,
            active_profile: "personal".to_string(),
            profiles,
            preferences: Preferences::default(),
            templates: Vec::new(),
        }
    }
}

/// 从 JS 端来的 camelCase JSON 里，profileData 的字段名可能是 activeProvider。
/// 反序列化用两种字段名兼容 (rename_all + alias)。
mod camel_compat {
    use super::*;
    use serde::{Deserialize, Serialize};

    #[derive(Debug, Clone, Serialize, Deserialize, Default)]
    #[serde(rename_all = "camelCase")]
    pub struct ProviderEntryC {
        #[serde(rename = "type")]
        pub type_: String,
        #[serde(skip_serializing_if = "Option::is_none", default)]
        pub display_name: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none", default)]
        pub endpoint: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none", default)]
        pub model: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none", default)]
        pub api_key: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none", default)]
        pub extra: Option<serde_json::Value>,
    }

    #[derive(Debug, Clone, Serialize, Deserialize, Default)]
    #[serde(rename_all = "camelCase")]
    pub struct ProfileDataC {
        #[serde(skip_serializing_if = "Option::is_none", default)]
        pub active_provider: Option<String>,
        #[serde(default)]
        pub providers: BTreeMap<String, ProviderEntryC>,
    }

    #[derive(Debug, Clone, Serialize, Deserialize)]
    #[serde(rename_all = "camelCase")]
    pub struct AppConfigC {
        pub version: u32,
        pub active_profile: String,
        pub profiles: BTreeMap<String, ProfileDataC>,
        #[serde(default)]
        pub preferences: super::Preferences,
        #[serde(default)]
        pub templates: Vec<super::PromptTemplate>,
    }

    // camel <-> snake 转换
    impl From<ProviderEntryC> for super::ProviderEntry {
        fn from(v: ProviderEntryC) -> Self {
            Self {
                type_: v.type_,
                display_name: v.display_name,
                endpoint: v.endpoint,
                model: v.model,
                api_key: v.api_key,
                extra: v.extra,
            }
        }
    }
    impl From<super::ProviderEntry> for ProviderEntryC {
        fn from(v: super::ProviderEntry) -> Self {
            Self {
                type_: v.type_,
                display_name: v.display_name,
                endpoint: v.endpoint,
                model: v.model,
                api_key: v.api_key,
                extra: v.extra,
            }
        }
    }
    impl From<ProfileDataC> for super::ProfileData {
        fn from(v: ProfileDataC) -> Self {
            Self {
                active_provider: v.active_provider,
                providers: v
                    .providers
                    .into_iter()
                    .map(|(k, v)| (k, v.into()))
                    .collect(),
            }
        }
    }
    impl From<super::ProfileData> for ProfileDataC {
        fn from(v: super::ProfileData) -> Self {
            Self {
                active_provider: v.active_provider,
                providers: v
                    .providers
                    .into_iter()
                    .map(|(k, v)| (k, v.into()))
                    .collect(),
            }
        }
    }
    impl From<AppConfigC> for super::AppConfig {
        fn from(v: AppConfigC) -> Self {
            Self {
                version: v.version,
                active_profile: v.active_profile,
                profiles: v
                    .profiles
                    .into_iter()
                    .map(|(k, v)| (k, v.into()))
                    .collect(),
                preferences: v.preferences,
                templates: v.templates,
            }
        }
    }
    impl From<super::AppConfig> for AppConfigC {
        fn from(v: super::AppConfig) -> Self {
            Self {
                version: v.version,
                active_profile: v.active_profile,
                profiles: v
                    .profiles
                    .into_iter()
                    .map(|(k, v)| (k, v.into()))
                    .collect(),
                preferences: v.preferences,
                templates: v.templates,
            }
        }
    }
}

pub fn load_config() -> Result<AppConfig> {
    ensure_dirs()?;
    let path = config_path();
    if !path.exists() {
        let default = AppConfig::default();
        save_config(&default)?;
        return Ok(default);
    }
    let raw = fs::read_to_string(&path)
        .with_context(|| format!("读取 {} 失败", path.display()))?;
    // 先按 camelCase 试
    if let Ok(camel) = serde_json::from_str::<camel_compat::AppConfigC>(&raw) {
        return Ok(camel.into());
    }
    // 再按 snake_case 试
    let snake: AppConfig = serde_json::from_str(&raw)
        .with_context(|| format!("config.json 解析失败: {}", path.display()))?;
    Ok(snake)
}

pub fn save_config(cfg: &AppConfig) -> Result<()> {
    ensure_dirs()?;
    let path = config_path();
    let tmp = path.with_extension(format!("json.{}.tmp", std::process::id()));
    let camel: camel_compat::AppConfigC = cfg.clone().into();
    let json = serde_json::to_string_pretty(&camel)?;
    fs::write(&tmp, json)?;
    fs::rename(&tmp, &path)?;
    Ok(())
}

pub fn mask_key(key: &str) -> String {
    // 按字符而非字节切片，避免非 ASCII key panic
    let chars: Vec<char> = key.chars().collect();
    if chars.len() <= 8 {
        "***".to_string()
    } else {
        let head: String = chars.iter().take(4).collect();
        let tail: String = chars.iter().skip(chars.len() - 4).collect();
        format!("{head}***{tail}")
    }
}

/// 获取当前 profile 的可变引用
pub fn active_profile_mut(cfg: &mut AppConfig) -> Result<&mut ProfileData> {
    let name = cfg.active_profile.clone();
    cfg.profiles
        .get_mut(&name)
        .ok_or_else(|| anyhow!("当前 profile \"{name}\" 不存在"))
}

pub fn active_profile(cfg: &AppConfig) -> Result<&ProfileData> {
    cfg.profiles
        .get(&cfg.active_profile)
        .ok_or_else(|| anyhow!("当前 profile \"{}\" 不存在", cfg.active_profile))
}
