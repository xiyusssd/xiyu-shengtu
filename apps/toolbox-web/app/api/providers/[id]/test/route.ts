import { NextRequest, NextResponse } from "next/server";
import { getActiveProfile, loadConfig } from "@xiyu-shengtu/toolbox-core";
import { getProvider } from "@xiyu-shengtu/provider-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const cfg = loadConfig();
    const entry = getActiveProfile(cfg).providers[id];
    if (!entry) {
      return NextResponse.json(
        { error: `provider "${id}" 不存在` },
        { status: 404 }
      );
    }
    const impl = getProvider(entry.type);
    if (!impl) {
      return NextResponse.json(
        { error: `未实现 provider type: ${entry.type}` },
        { status: 400 }
      );
    }
    const res = await impl.validate(entry);
    return NextResponse.json(res);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
