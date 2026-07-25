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
