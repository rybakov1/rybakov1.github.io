import { Suspense } from "react";
import { ReferencePage } from "@/components/platform/library";
import { pageMetadata } from "@/lib/seo";
export const metadata = pageMetadata({ title: "Справочная карточка", description: "Коды ошибок и симптомы.", path: "/references/", noindex: true });
export default function Page() { return <Suspense fallback={<div className="workspace">Загрузка…</div>}><ReferencePage/></Suspense>; }
