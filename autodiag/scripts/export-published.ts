/** Export only validated published database records for the next static build. */
import { writeFile, rename, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { PrismaClient, PublicationStatus } from "@prisma/client";
import { contentSchema, type ValidatedContent } from "../src/lib/content-schema";

const collections = { CODE: "codes", SYMPTOM: "symptoms", INDICATOR: "indicators", GUIDE: "guides" } as const;
const outputPath = resolve(process.cwd(), "src/data/published.json");
const temporaryPath = `${outputPath}.${process.pid}.tmp`;

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for export.");
  const prisma = new PrismaClient();
  try {
    const rows = await prisma.contentItem.findMany({
      where: { status: PublicationStatus.PUBLISHED },
      orderBy: [{ type: "asc" }, { slug: "asc" }],
    });
    const result: Record<(typeof collections)[keyof typeof collections], ValidatedContent[]> = { codes: [], symptoms: [], indicators: [], guides: [] };
    const errors: string[] = [];
    for (const row of rows) {
      const candidate = {
        slug: row.slug, title: row.title, summary: row.summary, category: row.category,
        status: "published", sections: row.sections, related: row.related, sources: row.sources,
        updatedAt: row.updatedAt.toISOString().slice(0, 10), verificationStatus: row.verificationStatus,
        verifiedAt: row.verifiedAt?.toISOString().slice(0, 10),
        code: row.code ?? undefined, system: row.system ?? undefined,
        group: row.group ?? undefined, severity: row.severity ?? undefined,
      };
      const parsed = contentSchema.safeParse(candidate);
      if (!parsed.success) {
        errors.push(`${row.type}/${row.slug}: ${parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join(", ")}`);
        continue;
      }
      if (row.type === "CODE" && (!parsed.data.code || !parsed.data.system || !parsed.data.group || !parsed.data.severity)) {
        errors.push(`${row.type}/${row.slug}: code, system, group and severity are required`);
        continue;
      }
      if (row.type !== "CODE" && parsed.data.code) {
        errors.push(`${row.type}/${row.slug}: only code records may contain a diagnostic code`);
        continue;
      }
      result[collections[row.type]].push(parsed.data);
    }
    if (errors.length) throw new Error(`Export refused; published records failed validation:\n${errors.join("\n")}`);
    await writeFile(temporaryPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
    try { await rename(temporaryPath, outputPath); }
    catch (error) { await unlink(temporaryPath).catch(() => {}); throw error; }
    console.log(`Exported ${rows.length} published records to src/data/published.json. Rebuild the site to apply them.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
