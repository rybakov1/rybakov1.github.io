import { AlgorithmEditor } from "@/components/platform/editor";
import { pageMetadata } from "@/lib/seo";
export const metadata = pageMetadata({ title: "Редактор алгоритмов", description: "Локальный редактор диагностических алгоритмов.", path: "/editor/", noindex: true });
export default function Page(){ return <div className="workspace"><AlgorithmEditor/></div> }
