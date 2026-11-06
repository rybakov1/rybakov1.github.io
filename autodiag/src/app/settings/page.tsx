import { Suspense } from "react";
import { SettingsPage } from "@/components/platform/library";
import { pageMetadata } from "@/lib/seo";
export const metadata = pageMetadata({ title: "Настройки", description: "Локальное рабочее пространство DiagDoc.", path: "/settings/", noindex: true });
export default function Page() { return <Suspense fallback={<div className="workspace">Загрузка…</div>}><SettingsPage/></Suspense>; }
