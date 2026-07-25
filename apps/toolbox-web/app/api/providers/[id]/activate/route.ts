import { NextRequest, NextResponse } from "next/server";
import {
  loadConfig,
  saveConfig,
  useProvider,
} from "@xiyu-shengtu/toolbox-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const cfg = loadConfig();
    useProvider(cfg, id);
    saveConfig(cfg);
    return NextResponse.json({ ok: true, activeProviderId: id });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 }
    );
  }
}
