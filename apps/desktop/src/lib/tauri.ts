import { invoke, Channel } from "@tauri-apps/api/core";
import type { ConfigSnapshot } from "./types";

export interface CreateProviderInput {
  id: string;
  type: string;
  displayName?: string;
  endpoint?: string;
  model?: string;
  apiKey?: string;
}

export interface UpdateProviderInput {
  displayName?: string;
  endpoint?: string;
  model?: string;
  apiKey?: string;
  clearKey?: boolean;
}

export interface ValidateResult {
  ok: boolean;
  latencyMs?: number;
  message?: string;
}

export function readConfig(): Promise<ConfigSnapshot> {
  return invoke<ConfigSnapshot>("read_config");
}

export function createProvider(input: CreateProviderInput): Promise<void> {
  return invoke<void>("create_provider", { input });
}

export function updateProvider(
  id: string,
  patch: UpdateProviderInput
): Promise<void> {
  return invoke<void>("update_provider", { id, patch });
}

export function deleteProvider(id: string): Promise<void> {
  return invoke<void>("delete_provider", { id });
}

export function activateProvider(id: string): Promise<void> {
  return invoke<void>("activate_provider", { id });
}

export function testProvider(id: string): Promise<ValidateResult> {
  return invoke<ValidateResult>("test_provider", { id });
}

/* -------- 生图 -------- */

export interface BatchItem {
  prompt: string;
  referenceImage?: string;
}

export interface BatchInput {
  providerId?: string;
  items: BatchItem[];
  size: { w: number; h: number };
  concurrency: number;
  negativePrompt?: string;
  seed?: number;
}

export type BatchEvent =
  | { kind: "batch_start"; total: number; concurrency: number }
  | { kind: "task_start"; taskIndex: number; hasReference: boolean }
  | { kind: "progress"; taskIndex: number; percent: number; message?: string }
  | {
      kind: "image";
      taskIndex: number;
      dataUrl: string;
      seed?: number;
    }
  | { kind: "error"; taskIndex: number; code: string; message: string }
  | {
      kind: "task_end";
      taskIndex: number;
      doneCount: number;
      total: number;
    }
  | { kind: "batch_done"; total: number; doneCount: number };

export function generateBatch(
  input: BatchInput,
  onEvent: (evt: BatchEvent) => void
): Promise<void> {
  const channel = new Channel<BatchEvent>();
  channel.onmessage = onEvent;
  return invoke<void>("generate_batch", { input, channel });
}

/* -------- 偏好 -------- */

export interface Preferences {
  defaultProviderId?: string;
  defaultSizePreset?: number;
  defaultConcurrency?: number;
  theme?: "light" | "dark" | "system";
  outputDir?: string;
  httpProxy?: string;
  requestTimeoutSecs?: number;
  retryCount?: number;
}

/* -------- Profile -------- */
export function listProfiles(): Promise<string[]> {
  return invoke<string[]>("list_profiles");
}
export function createProfile(name: string): Promise<void> {
  return invoke<void>("create_profile", { name });
}
export function switchProfile(name: string): Promise<void> {
  return invoke<void>("switch_profile", { name });
}
export function renameProfile(oldName: string, newName: string): Promise<void> {
  return invoke<void>("rename_profile", { oldName, newName });
}
export function deleteProfileCmd(name: string): Promise<void> {
  return invoke<void>("delete_profile", { name });
}

export function getPreferences(): Promise<Preferences> {
  return invoke<Preferences>("get_preferences");
}

export function setPreferences(prefs: Preferences): Promise<void> {
  return invoke<void>("set_preferences", { prefs });
}

/* -------- 导入导出 -------- */

export function exportProviders(includeKeys: boolean): Promise<string> {
  return invoke<string>("export_providers", { includeKeys });
}

export interface ImportResult {
  added: number;
  overwritten: number;
  skipped: number;
}

export function importProviders(
  json: string,
  mode: "merge" | "overwrite" | "replace"
): Promise<ImportResult> {
  return invoke<ImportResult>("import_providers", {
    input: { json, mode },
  });
}

/* -------- 提示词模板 -------- */

export interface PromptTemplate {
  id: string;
  name: string;
  prompt: string;
  tags?: string[];
  createdAt: number;
}

export function listTemplates(): Promise<PromptTemplate[]> {
  return invoke<PromptTemplate[]>("list_templates");
}

export function createTemplate(input: {
  name: string;
  prompt: string;
  tags?: string[];
}): Promise<PromptTemplate> {
  return invoke<PromptTemplate>("create_template", { input });
}

export function updateTemplate(
  id: string,
  patch: { name?: string; prompt?: string; tags?: string[] }
): Promise<void> {
  return invoke<void>("update_template", { id, patch });
}

export function deleteTemplate(id: string): Promise<void> {
  return invoke<void>("delete_template", { id });
}

/* -------- 历史 -------- */

export interface HistoryItem {
  id: string;
  prompt: string;
  providerId: string;
  providerType: string;
  width: number;
  height: number;
  seed?: number;
  relativePath: string;
  createdAt: number;
}

export function saveHistoryItem(input: {
  prompt: string;
  providerId: string;
  providerType: string;
  width: number;
  height: number;
  seed?: number;
  dataUrl: string;
}): Promise<HistoryItem> {
  return invoke<HistoryItem>("save_history_item", { input });
}

export function listHistory(): Promise<HistoryItem[]> {
  return invoke<HistoryItem[]>("list_history");
}

export function deleteHistoryItem(id: string): Promise<void> {
  return invoke<void>("delete_history_item", { id });
}

export function clearHistory(): Promise<void> {
  return invoke<void>("clear_history");
}

export function readHistoryImage(relativePath: string): Promise<string> {
  return invoke<string>("read_history_image", { relativePath });
}

export function openConfigFolder(): Promise<string> {
  return invoke<string>("open_config_folder");
}

/* -------- 提示词翻译/润色 -------- */
export function translatePrompt(input: {
  text: string;
  providerId?: string;
  mode?: "translate" | "polish";
}): Promise<string> {
  return invoke<string>("translate_prompt", { input });
}
