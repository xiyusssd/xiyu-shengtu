import fs from "node:fs";
import { CONFIG_PATH, IMAGEGEN_HOME, IMAGES_DIR, LOGS_DIR } from "./paths";

export interface ProviderEntry {
  type: string;
  displayName?: string;
  endpoint?: string;
  model?: string;
  apiKey?: string;
  extra?: Record<string, unknown>;
}

export interface ProfileData {
  activeProvider?: string;
  providers: Record<string, ProviderEntry>;
}

export interface AppConfig {
  version: 1;
  activeProfile: string;
  profiles: Record<string, ProfileData>;
  preferences?: {
    outputDir?: string;
    language?: string;
    theme?: string;
  };
}

const DEFAULT_CONFIG: AppConfig = {
  version: 1,
  activeProfile: "personal",
  profiles: {
    personal: {
      providers: {},
    },
  },
  preferences: {
    outputDir: IMAGES_DIR,
    language: "zh-CN",
    theme: "system",
  },
};

export function ensureDirs(): void {
  for (const dir of [IMAGEGEN_HOME, IMAGES_DIR, LOGS_DIR]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function loadConfig(): AppConfig {
  ensureDirs();
  if (!fs.existsSync(CONFIG_PATH)) {
    saveConfig(DEFAULT_CONFIG);
    return structuredClone(DEFAULT_CONFIG);
  }
  const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
  try {
    const parsed = JSON.parse(raw) as AppConfig;
    if (!parsed.profiles || typeof parsed.profiles !== "object") {
      throw new Error("config.profiles 缺失");
    }
    return parsed;
  } catch (err) {
    throw new Error(
      `config.json 解析失败：${err instanceof Error ? err.message : String(err)}`
    );
  }
}

export function saveConfig(cfg: AppConfig): void {
  ensureDirs();
  const tmp = `${CONFIG_PATH}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2), "utf-8");
  fs.renameSync(tmp, CONFIG_PATH);
}

export function getActiveProfile(cfg: AppConfig): ProfileData {
  const name = cfg.activeProfile;
  const profile = cfg.profiles[name];
  if (!profile) {
    throw new Error(`当前 profile "${name}" 不存在`);
  }
  return profile;
}

export function getActiveProvider(
  cfg: AppConfig
): { id: string; entry: ProviderEntry } | null {
  const profile = getActiveProfile(cfg);
  const id = profile.activeProvider;
  if (!id) return null;
  const entry = profile.providers[id];
  if (!entry) return null;
  return { id, entry };
}

export function maskKey(key?: string): string {
  if (!key) return "(空)";
  if (key.length <= 8) return "***";
  return `${key.slice(0, 4)}***${key.slice(-4)}`;
}

export function addProvider(
  cfg: AppConfig,
  id: string,
  entry: ProviderEntry
): AppConfig {
  const profile = getActiveProfile(cfg);
  if (profile.providers[id]) {
    throw new Error(`provider id "${id}" 已存在`);
  }
  profile.providers[id] = entry;
  if (!profile.activeProvider) profile.activeProvider = id;
  return cfg;
}

export function removeProvider(cfg: AppConfig, id: string): AppConfig {
  const profile = getActiveProfile(cfg);
  if (!profile.providers[id]) {
    throw new Error(`provider id "${id}" 不存在`);
  }
  delete profile.providers[id];
  if (profile.activeProvider === id) {
    profile.activeProvider = Object.keys(profile.providers)[0];
  }
  return cfg;
}

export function useProvider(cfg: AppConfig, id: string): AppConfig {
  const profile = getActiveProfile(cfg);
  if (!profile.providers[id]) {
    throw new Error(`provider id "${id}" 不存在`);
  }
  profile.activeProvider = id;
  return cfg;
}

export function useProfile(cfg: AppConfig, name: string): AppConfig {
  if (!cfg.profiles[name]) {
    cfg.profiles[name] = { providers: {} };
  }
  cfg.activeProfile = name;
  return cfg;
}

export function getConfigPath(): string {
  return CONFIG_PATH;
}
