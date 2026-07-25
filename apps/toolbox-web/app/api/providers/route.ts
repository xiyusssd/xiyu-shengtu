import { NextRequest, NextResponse } from "next/server";
import {
  addProvider,
  loadConfig,
  saveConfig,
} from "@xiyu-shengtu/toolbox-core";
import { getTemplate } from "@xiyu-shengtu/toolbox-core/templates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface CreateBody {
  id: string;
  type: string;
  displayName?: string;
  endpoint?: string;
  model?: string;
  apiKey?: string;
  extra?: Record<string, unknown>;
}

export async function POST(req: NextRequest) {
  let body: CreateBody;
  try {
    body = (await req.json()) as CreateBody;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (!body.id?.trim()) {
    return NextResponse.json({ error: "id 不能为空" }, { status: 400 });
  }
  if (!/^[a-zA-Z0-9._-]+$/.test(body.id)) {
    return NextResponse.json(
      { error: "id 只允许字母数字 . _ -" },
      { status: 400 }
    );
  }
  if (!body.type || !getTemplate(body.type)) {
    return NextResponse.json({ error: "未知 provider 类型" }, { status: 400 });
  }
  try {
    const cfg = loadConfig();
    addProvider(cfg, body.id, {
      type: body.type,
      displayName: body.displayName,
      endpoint: body.endpoint,
      model: body.model,
      apiKey: body.apiKey,
      extra: body.extra,
    });
    saveConfig(cfg);
    return NextResponse.json({ ok: true, id: body.id });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 }
    );
  }
}
