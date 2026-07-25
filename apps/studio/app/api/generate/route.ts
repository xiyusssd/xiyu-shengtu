import { NextRequest } from "next/server";
import { loadConfig } from "@xiyu-shengtu/toolbox-core";
import { getProvider } from "@xiyu-shengtu/provider-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface BatchItem {
  prompt: string;
  referenceImage?: string;
}

interface GenerateBody {
  providerId?: string;
  items: BatchItem[];
  size?: { w?: number; h?: number };
  concurrency?: number;
  seed?: number;
}

function encodeSSE(obj: unknown): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(obj)}\n\n`);
}

export async function POST(req: NextRequest) {
  let body: GenerateBody;
  try {
    body = (await req.json()) as GenerateBody;
  } catch {
    return new Response("invalid json body", { status: 400 });
  }
  if (!Array.isArray(body.items) || body.items.length === 0) {
    return new Response("items 不能为空", { status: 400 });
  }
  const validItems = body.items.filter((it) => it?.prompt?.trim());
  if (validItems.length === 0) {
    return new Response("至少需要一行有 prompt", { status: 400 });
  }

  let providerEntry: ReturnType<typeof loadConfig>["profiles"][string]["providers"][string];
  try {
    const config = loadConfig();
    const profile = config.profiles[config.activeProfile];
    const providerId = body.providerId ?? profile?.activeProvider;
    if (!providerId || !profile?.providers[providerId]) {
      return new Response("no active provider", { status: 400 });
    }
    providerEntry = profile.providers[providerId];
  } catch (err) {
    return new Response(err instanceof Error ? err.message : String(err), {
      status: 500,
    });
  }
  const impl = getProvider(providerEntry.type);
  if (!impl) {
    return new Response(`未实现 provider: ${providerEntry.type}`, {
      status: 400,
    });
  }

  const abortCtl = new AbortController();
  req.signal.addEventListener("abort", () => abortCtl.abort());

  const size = {
    w: body.size?.w ?? 1024,
    h: body.size?.h ?? 1024,
  };
  const concurrency = Math.max(1, Math.min(body.concurrency ?? 5, 10));

  const stream = new ReadableStream({
    async start(controller) {
      const total = body.items.length;
      controller.enqueue(
        encodeSSE({ type: "batch_start", total, concurrency })
      );

      let doneCount = 0;

      async function runOne(taskIndex: number, item: BatchItem) {
        if (!item?.prompt?.trim()) {
          controller.enqueue(
            encodeSSE({
              type: "task_skipped",
              taskIndex,
              reason: "prompt 为空",
            })
          );
          return;
        }
        controller.enqueue(
          encodeSSE({
            type: "task_start",
            taskIndex,
            hasReference: Boolean(item.referenceImage),
          })
        );
        try {
          const iter = impl!.generate(
            providerEntry,
            {
              prompt: item.prompt,
              size,
              seed: body.seed,
              initImage: item.referenceImage,
            },
            { signal: abortCtl.signal }
          );
          for await (const evt of iter) {
            controller.enqueue(encodeSSE({ ...evt, taskIndex }));
          }
        } catch (err) {
          controller.enqueue(
            encodeSSE({
              type: "error",
              code: "runtime_error",
              message: err instanceof Error ? err.message : String(err),
              taskIndex,
            })
          );
        } finally {
          doneCount += 1;
          controller.enqueue(
            encodeSSE({
              type: "task_end",
              taskIndex,
              doneCount,
              total,
            })
          );
        }
      }

      // 简易并发池
      const queue = body.items.map((item, idx) => ({ item, idx }));
      const workers: Promise<void>[] = [];
      let nextIdx = 0;
      async function worker() {
        while (nextIdx < queue.length) {
          if (abortCtl.signal.aborted) return;
          const cur = queue[nextIdx++];
          await runOne(cur.idx, cur.item);
        }
      }
      for (let i = 0; i < Math.min(concurrency, queue.length); i++) {
        workers.push(worker());
      }
      await Promise.all(workers);
      controller.enqueue(encodeSSE({ type: "batch_done", total, doneCount }));
      controller.close();
    },
    cancel() {
      abortCtl.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
