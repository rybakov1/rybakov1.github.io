import { Suspense } from "react";
import { CasePage } from "@/components/platform/library";
import { pageMetadata } from "@/lib/seo";
export const metadata = pageMetadata({ title: "Практический случай", description: "Вымышленный учебный случай.", path: "/cases/view/", noindex: true });
export default function Page() { return <Suspense fallback={<div className="workspace">Загрузка…</div>}><CasePage/></Suspense>; }
