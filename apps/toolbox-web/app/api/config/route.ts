import { NextResponse } from "next/server";
import {
  getConfigPath,
  loadConfig,
  maskKey,
} from "@xiyu-shengtu/toolbox-core";
import { listProviders } from "@xiyu-shengtu/provider-core";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const cfg = loadConfig();
    const profile = cfg.profiles[cfg.activeProfile];
    const providers = Object.entries(profile?.providers ?? {}).map(
      ([id, p]) => ({
        id,
        type: p.type,
        displayName: p.displayName,
        endpoint: p.endpoint,
        model: p.model,
        hasKey: Boolean(p.apiKey),
        keyMasked: p.apiKey ? maskKey(p.apiKey) : null,
      })
    );
    return NextResponse.json({
      activeProfile: cfg.activeProfile,
      activeProviderId: profile?.activeProvider ?? null,
      configPath: getConfigPath(),
      profiles: Object.keys(cfg.profiles),
      providers,
      availableTypes: listProviders().map((p) => ({
        id: p.id,
        displayName: p.displayName,
        capabilities: p.capabilities,
      })),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
