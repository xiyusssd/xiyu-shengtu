/**
 * 极轻量前端事件总线
 * 只在 App 内的 Tab 之间通讯（不依赖 Tauri event）
 */
type Handler<T> = (payload: T) => void;

const listeners = new Map<string, Set<Handler<unknown>>>();

export function on<T = unknown>(topic: string, handler: Handler<T>): () => void {
  const set = listeners.get(topic) ?? new Set();
  set.add(handler as Handler<unknown>);
  listeners.set(topic, set);
  return () => set.delete(handler as Handler<unknown>);
}

export function emit<T = unknown>(topic: string, payload: T): void {
  const set = listeners.get(topic);
  if (!set) return;
  for (const handler of set) {
    try {
      (handler as Handler<T>)(payload);
    } catch (err) {
      console.error("event handler error", err);
    }
  }
}
