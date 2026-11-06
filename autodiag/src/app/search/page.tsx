import { Suspense } from "react";
import { SearchPage } from "@/components/platform/library";
import { pageMetadata } from "@/lib/seo";
export const metadata = pageMetadata({ title: "Поиск", description: "Поиск по каталогу DiagDoc.", path: "/search/", noindex: true });
export default function Page() { return <Suspense fallback={<div className="workspace">Загрузка…</div>}><SearchPage/></Suspense>; }
