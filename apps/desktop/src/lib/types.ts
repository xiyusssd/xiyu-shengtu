export interface ProviderRow {
  id: string;
  type: string;
  displayName?: string;
  endpoint?: string;
  model?: string;
  hasKey: boolean;
  keyMasked: string | null;
}

export interface AvailableType {
  id: string;
  displayName: string;
  capabilities: string[];
}

export interface ConfigSnapshot {
  activeProfile: string;
  activeProviderId: string | null;
  configPath: string;
  profiles: string[];
  providers: ProviderRow[];
  availableTypes: AvailableType[];
}

export type RowStatus = "idle" | "queued" | "running" | "done" | "error";

export interface BatchRowData {
  id: string;
  prompt: string;
  referenceImage?: string;
  referenceName?: string;
  status: RowStatus;
  progress: number;
  result?: { dataUrl: string; seed?: number };
  errorMsg?: string;
}

export function newRow(): BatchRowData {
  return {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `r${Math.random().toString(36).slice(2)}`,
    prompt: "",
    status: "idle",
    progress: 0,
  };
}
