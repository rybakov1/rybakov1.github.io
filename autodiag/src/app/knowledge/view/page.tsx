import { Suspense } from "react";
import { ArticlePage } from "@/components/platform/library";
import { pageMetadata } from "@/lib/seo";
export const metadata = pageMetadata({ title: "Материал базы знаний", description: "Учебные материалы по диагностике.", path: "/knowledge/view/", noindex: true });
export default function Page() { return <Suspense fallback={<div className="workspace">Загрузка…</div>}><ArticlePage/></Suspense>; }
