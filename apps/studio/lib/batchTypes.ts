export type RowStatus = "idle" | "queued" | "running" | "done" | "error";

export interface BatchRowData {
  id: string;
  prompt: string;
  referenceImage?: string; // data URL
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
