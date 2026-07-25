import { NextRequest, NextResponse } from "next/server";
import {
  getActiveProfile,
  loadConfig,
  removeProvider,
  saveConfig,
} from "@xiyu-shengtu/toolbox-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface UpdateBody {
  displayName?: string;
  endpoint?: string;
  model?: string;
  apiKey?: string;
  clearKey?: boolean;
  extra?: Record<string, unknown>;
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  let body: UpdateBody;
  try {
    body = (await req.json()) as UpdateBody;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  try {
    const cfg = loadConfig();
    const profile = getActiveProfile(cfg);
    const entry = profile.providers[id];
    if (!entry) {
      return NextResponse.json(
        { error: `provider "${id}" 不存在` },
        { status: 404 }
      );
    }
    if (body.displayName !== undefined) entry.displayName = body.displayName;
    if (body.endpoint !== undefined) entry.endpoint = body.endpoint;
    if (body.model !== undefined) entry.model = body.model;
    if (body.clearKey) {
      entry.apiKey = undefined;
    } else if (body.apiKey !== undefined && body.apiKey !== "") {
      entry.apiKey = body.apiKey;
    }
    if (body.extra !== undefined) entry.extra = body.extra;
    saveConfig(cfg);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const cfg = loadConfig();
    removeProvider(cfg, id);
    saveConfig(cfg);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 }
    );
  }
}
