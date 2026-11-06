import { Suspense } from "react";
import { KnowledgePage } from "@/components/platform/library";
import { pageMetadata } from "@/lib/seo";
export const metadata = pageMetadata({ title: "База знаний", description: "Статьи о методах диагностики автомобилей.", path: "/knowledge/" });
export default function Page() { return <Suspense fallback={<div className="workspace">Загрузка…</div>}><KnowledgePage/></Suspense>; }
