import { Suspense } from "react";
import { AlgorithmsPage } from "@/components/platform/library";
import { pageMetadata } from "@/lib/seo";
export const metadata = pageMetadata({ title: "Алгоритмы диагностики", description: "Маршруты проверок и диагностические алгоритмы DiagDoc.", path: "/algorithms/" });
export default function Page() { return <Suspense fallback={<div className="workspace">Загрузка…</div>}><AlgorithmsPage/></Suspense>; }
