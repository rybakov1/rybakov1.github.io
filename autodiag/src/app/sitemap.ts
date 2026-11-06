import type { MetadataRoute } from "next";
import { codes, symptoms, indicators, guides } from "../data/content";
import { absoluteUrl } from "../lib/seo";

export default function sitemap(): MetadataRoute.Sitemap {
  const pages = ["/", "/codes/", "/symptoms/", "/dashboard/", "/guides/", "/about/", "/privacy/"];
  const collections = [
    { base: "codes", items: codes },
    { base: "symptoms", items: symptoms },
    { base: "dashboard", items: indicators },
    { base: "guides", items: guides },
  ];

  return [
    ...pages.map((path) => ({ url: absoluteUrl(path) })),
    ...collections.flatMap(({ base, items }) =>
      items.filter((item) => item.status !== "draft").map((item) => ({
        url: absoluteUrl(`/${base}/${item.slug}/`),
        ...(item.updatedAt ? { lastModified: item.updatedAt } : {}),
      })),
    ),
  ];
}

export const dynamic = "force-static";
