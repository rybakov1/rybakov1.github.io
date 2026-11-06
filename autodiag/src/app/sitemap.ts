import type { MetadataRoute } from "next";
import { codes, symptoms, indicators, guides } from "../data/content";
import { absoluteUrl } from "../lib/seo";
import { algorithms as platformAlgorithms, checks as platformChecks, dtcs as platformDtcs, symptoms as platformSymptoms, articles as platformArticles, cases as platformCases } from "../platform/seed";

export default function sitemap(): MetadataRoute.Sitemap {
  const pages = ["/", "/codes/", "/symptoms/", "/dashboard/", "/guides/", "/about/", "/privacy/", "/algorithms/", "/checks/", "/knowledge/", "/cases/"];
  const collections = [
    { base: "codes", items: codes },
    { base: "symptoms", items: symptoms },
    { base: "dashboard", items: indicators },
    { base: "guides", items: guides },
  ];

  return [
    ...pages.map((path) => ({ url: absoluteUrl(path) })),
    ...platformAlgorithms.filter(item => item.status === "published").map(item => ({ url: absoluteUrl(`/algorithms/${item.id}/`), lastModified: item.updatedAt })),
    ...platformChecks.map(item => ({ url: absoluteUrl(`/checks/${item.id}/`) })),
    ...platformArticles.map(item => ({ url: absoluteUrl(`/knowledge/${item.id}/`) })),
    ...platformCases.map(item => ({ url: absoluteUrl(`/cases/${item.id}/`) })),
    ...platformDtcs.filter(item => !codes.some(code => code.slug === item.id && code.status !== "draft")).map(item => ({ url: absoluteUrl(`/references/dtc/${item.id}/`) })),
    ...platformSymptoms.map(item => ({ url: absoluteUrl(`/references/symptom/${item.id}/`) })),
    ...collections.flatMap(({ base, items }) =>
      items.filter((item) => item.status !== "draft").map((item) => ({
        url: absoluteUrl(`/${base}/${item.slug}/`),
        ...(item.updatedAt ? { lastModified: item.updatedAt } : {}),
      })),
    ),
  ];
}

export const dynamic = "force-static";
