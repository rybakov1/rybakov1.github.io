import snapshot from "./published.json";
import { codes as demoCodes, symptoms as demoSymptoms, indicators as demoIndicators, guides as demoGuides } from "./demo-content";
import type { CodeItem, ContentItem } from "./demo-content";

export type { Source, ContentItem, CodeItem } from "./demo-content";

// A reviewed record replaces its demo counterpart in the rendered collection,
// but never mutates or overwrites the source demo data.
function merge<T extends ContentItem>(demo: T[], published: T[]): T[] {
  const result = new Map(demo.map((item) => [item.slug, item]));
  for (const item of published) result.set(item.slug, item);
  return Array.from(result.values());
}

const published = snapshot as { codes: CodeItem[]; symptoms: ContentItem[]; indicators: ContentItem[]; guides: ContentItem[] };
export const codes = merge(demoCodes, published.codes);
export const symptoms = merge(demoSymptoms, published.symptoms);
export const indicators = merge(demoIndicators, published.indicators);
export const guides = merge(demoGuides, published.guides);
