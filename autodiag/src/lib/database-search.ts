import { PrismaClient } from "@prisma/client";

/** PostgreSQL-backed search for installations using the editorial database.
 * Search is parameterized and only exposes published records.
 */
export async function searchPublishedContent(prisma: PrismaClient, input: string, limit = 20) {
  const query = input.trim().slice(0, 120);
  if (!query) return [];
  const prefix = `${query.replace(/[\\%_]/g, "\\$&")}%`;
  const take = Math.max(1, Math.min(Math.trunc(limit) || 20, 100));
  return prisma.$queryRaw<Array<{ type: string; slug: string; title: string; summary: string; code: string | null }>>`
    SELECT "type"::text, "slug", "title", "summary", "code"
    FROM "ContentItem"
    WHERE "status" = 'PUBLISHED'
      AND ("code" ILIKE ${prefix} OR
        to_tsvector('russian'::regconfig, coalesce("title", '') || ' ' || coalesce("summary", '') || ' ' || coalesce("code", ''))
        @@ plainto_tsquery('russian'::regconfig, ${query}))
    ORDER BY CASE WHEN "code" ILIKE ${prefix} THEN 0 ELSE 1 END, "title"
    LIMIT ${take}
  `;
}
