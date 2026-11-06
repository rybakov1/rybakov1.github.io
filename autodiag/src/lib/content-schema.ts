import { z } from "zod";

const nonEmpty = z.string().trim().min(1);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD").refine((s) => {
  const value = new Date(`${s}T00:00:00.000Z`);
  return !Number.isNaN(value.getTime()) && value.toISOString().slice(0, 10) === s;
}, "Invalid date");

const sourceSchema = z.object({
  title: nonEmpty,
  url: z.string().url().refine((s) => ["https:", "http:"].includes(new URL(s).protocol), "Use an HTTP(S) source"),
});

export const contentSchema = z.object({
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use a lowercase URL slug"),
  title: nonEmpty,
  summary: nonEmpty,
  category: nonEmpty,
  status: z.enum(["draft", "needs_review", "published"]),
  sections: z.array(z.object({ heading: nonEmpty, paragraphs: z.array(nonEmpty).min(1) })),
  related: z.array(z.object({ label: nonEmpty, href: z.string().regex(/^\/(?!\/)/, "Use a local path") })),
  sources: z.array(sourceSchema),
  updatedAt: date,
  verificationStatus: z.enum(["verified", "unverified"]).optional(),
  verifiedAt: date.optional(),
  code: z.string().regex(/^[PBCU][0-9A-F]{4}$/).optional(),
  system: nonEmpty.optional(),
  group: z.enum(["P", "B", "C", "U"]).optional(),
  severity: nonEmpty.optional(),
}).superRefine((item, ctx) => {
  if (item.status === "published") {
    if (item.verificationStatus !== "verified") ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["verificationStatus"], message: "Published content must be explicitly verified" });
    if (!item.verifiedAt) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["verifiedAt"], message: "Published content needs a verification date" });
    if (item.sources.length === 0) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["sources"], message: "Published content needs at least one source" });
    if (item.sections.length < 2) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["sections"], message: "Published content needs at least two substantive sections" });
  }
  if (item.code && (item.code.toLowerCase() !== item.slug || item.group !== item.code[0] || !item.system)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["code"], message: "Code slug, group, and system must agree" });
  }
});

export type ValidatedContent = z.infer<typeof contentSchema>;
