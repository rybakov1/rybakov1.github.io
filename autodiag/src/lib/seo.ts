import type { Metadata } from "next";

// Configure this to the public HTTPS origin before indexing the site.
export const siteUrl = new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000");

export function absoluteUrl(path = "/"): string {
  return new URL(path, siteUrl).toString();
}

export function pageMetadata({ title, description, path, noindex = false }: {
  title: string;
  description: string;
  path: string;
  noindex?: boolean;
}): Metadata {
  const url = absoluteUrl(path);
  return {
    title,
    description,
    alternates: { canonical: url },
    robots: { index: false, follow: true },
    openGraph: { title, description, url, siteName: "AutoDiag", locale: "ru_RU", type: "website" },
    twitter: { card: "summary", title, description },
  };
}

export function breadcrumbJsonLd(items: { label: string; href: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.label,
      item: absoluteUrl(item.href),
    })),
  };
}

export function articleJsonLd({ title, description, path, updatedAt }: {
  title: string;
  description: string;
  path: string;
  updatedAt?: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: title,
    description,
    mainEntityOfPage: absoluteUrl(path),
    publisher: { "@type": "Organization", name: "AutoDiag" },
    ...(updatedAt ? { dateModified: updatedAt } : {}),
  };
}

/** Escape characters that could terminate a JSON-LD script element. */
export function jsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

