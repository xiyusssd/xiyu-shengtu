import { NextResponse } from "next/server";
import { loadConfig } from "@xiyu-shengtu/toolbox-core";

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
        hasKey: Boolean(p.apiKey),
      })
    );
    return NextResponse.json({
      activeProfile: cfg.activeProfile,
      activeProviderId: profile?.activeProvider ?? null,
      providers,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
