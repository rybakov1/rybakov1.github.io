import { Suspense } from "react";
import { CheckPage } from "@/components/platform/library";
import { pageMetadata } from "@/lib/seo";
export const metadata = pageMetadata({ title: "Проверка", description: "Методика диагностической проверки.", path: "/checks/view/", noindex: true });
export default function Page() { return <Suspense fallback={<div className="workspace">Загрузка…</div>}><CheckPage/></Suspense>; }
