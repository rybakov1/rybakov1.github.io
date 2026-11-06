import { Suspense } from "react";
import { DiagnosisPage } from "@/components/platform/library";
import { pageMetadata } from "@/lib/seo";
export const metadata = pageMetadata({ title: "Диагностика", description: "Возможности диагностики в следующей версии.", path: "/diagnosis/", noindex: true });
export default function Page() { return <Suspense fallback={<div className="workspace">Загрузка…</div>}><DiagnosisPage/></Suspense>; }
