import { Suspense } from "react";
import { ChecksPage } from "@/components/platform/library";
import { pageMetadata } from "@/lib/seo";
export const metadata = pageMetadata({ title: "Проверки", description: "Библиотека методик автомобильной диагностики.", path: "/checks/" });
export default function Page() { return <Suspense fallback={<div className="workspace">Загрузка…</div>}><ChecksPage/></Suspense>; }
