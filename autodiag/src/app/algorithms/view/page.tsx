import { Suspense } from "react";
import { AlgorithmPage } from "@/components/platform/library";
import { pageMetadata } from "@/lib/seo";
export const metadata = pageMetadata({ title: "Просмотр алгоритма", description: "Чтение диагностического алгоритма.", path: "/algorithms/view/", noindex: true });
export default function Page() { return <Suspense fallback={<div className="workspace">Загрузка…</div>}><AlgorithmPage/></Suspense>; }
