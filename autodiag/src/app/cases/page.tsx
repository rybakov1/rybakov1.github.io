import { Suspense } from "react";
import { CasesPage } from "@/components/platform/library";
import { pageMetadata } from "@/lib/seo";
export const metadata = pageMetadata({ title: "Практические случаи", description: "Учебные примеры автомобильной диагностики.", path: "/cases/" });
export default function Page() { return <Suspense fallback={<div className="workspace">Загрузка…</div>}><CasesPage/></Suspense>; }
