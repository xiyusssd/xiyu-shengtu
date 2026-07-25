export * from "./types";
export { mockProvider } from "./providers/mock";
export { openaiCompatProvider } from "./providers/openai-compat";
import { mockProvider } from "./providers/mock";
import { openaiCompatProvider } from "./providers/openai-compat";
import type { ImageProvider } from "./types";

const registry = new Map<string, ImageProvider>([
  [mockProvider.id, mockProvider],
  [openaiCompatProvider.id, openaiCompatProvider],
]);

export function getProvider(id: string): ImageProvider | undefined {
  return registry.get(id);
}

export function listProviders(): ImageProvider[] {
  return Array.from(registry.values());
}
