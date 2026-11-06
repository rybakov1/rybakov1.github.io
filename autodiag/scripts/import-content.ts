/**
 * Validate the local editorial dataset or a JSON file before importing.
 * Usage: tsx scripts/import-content.ts [--check] [--file path/to/content.json]
 * JSON shape: { "codes": [], "symptoms": [], "indicators": [], "guides": [] }.
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { contentSchema, type ValidatedContent } from "../src/lib/content-schema";

const types = { codes: "CODE", symptoms: "SYMPTOM", indicators: "INDICATOR", guides: "GUIDE" } as const;
type Collection = keyof typeof types;

async function main() {
  const args = process.argv.slice(2);
  const filePosition = args.indexOf("--file");
  if (filePosition !== -1 && (!args[filePosition + 1] || args[filePosition + 1].startsWith("--"))) throw new Error("--file requires a JSON path");
  const raw: Record<string, unknown> = filePosition >= 0
    ? JSON.parse(await readFile(resolve(args[filePosition + 1]), "utf8"))
    : await import("../src/data/demo-content");
  const items: { type: (typeof types)[Collection]; item: ValidatedContent }[] = [];
  const seenPaths = new Set<string>();
  const seenCodes = new Set<string>();
  const errors: string[] = [];

  for (const collection of Object.keys(types) as Collection[]) {
    const records = raw[collection];
    if (!Array.isArray(records)) { errors.push(`${collection}: expected an array`); continue; }
    for (const [index, entry] of records.entries()) {
      const result = contentSchema.safeParse(entry);
      const label = `${collection}[${index}]`;
      if (!result.success) {
        for (const issue of result.error.issues) errors.push(`${label}.${issue.path.join(".")}: ${issue.message}`);
        continue;
      }
      const item = result.data;
      if (collection === "codes" && (!item.code || !item.system || !item.group || !item.severity)) errors.push(`${label}: code, system, group and severity are required for a diagnostic code`);
      if (collection !== "codes" && item.code) errors.push(`${label}.code: only code records can have a diagnostic code`);
      const path = `${collection}/${item.slug}`;
      if (seenPaths.has(path)) errors.push(`${label}: duplicate path ${path}`);
      seenPaths.add(path);
      if (item.code && seenCodes.has(item.code)) errors.push(`${label}: duplicate code ${item.code}`);
      if (item.code) seenCodes.add(item.code);
      items.push({ type: types[collection], item });
    }
  }
  if (errors.length) throw new Error(`Content validation failed:\n${errors.join("\n")}`);
  console.log(`Validated ${items.length} records (${items.filter(({ item }) => item.status === "published").length} published).`);
  if (args.includes("--check")) return;
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for import. Use --check for validation only.");

  const { PrismaClient, PublicationStatus } = await import("@prisma/client");
  const prisma = new PrismaClient();
  try {
    await prisma.$transaction(items.map(({ type, item }) => {
      const data = {
        title: item.title, summary: item.summary, category: item.category,
        status: ({ draft: PublicationStatus.DRAFT, needs_review: PublicationStatus.NEEDS_REVIEW, published: PublicationStatus.PUBLISHED })[item.status],
        sections: item.sections, related: item.related, sources: item.sources,
        verificationStatus: item.verificationStatus ?? "unverified",
        verifiedAt: item.verifiedAt ? new Date(`${item.verifiedAt}T00:00:00.000Z`) : null,
        updatedAt: new Date(`${item.updatedAt}T00:00:00.000Z`),
        code: item.code ?? null, system: item.system ?? null, group: item.group ?? null, severity: item.severity ?? null,
      };
      return prisma.contentItem.upsert({ where: { type_slug: { type, slug: item.slug } }, create: { ...data, type, slug: item.slug }, update: data });
    }));
    console.log(`Imported ${items.length} records in one transaction.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
