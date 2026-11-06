import { Overview } from "@/components/platform/library";
import { pageMetadata } from "@/lib/seo";
export const metadata = pageMetadata({ title: "DiagDoc — платформа диагностических знаний", description: "Алгоритмы, проверки и практические случаи автомобильной диагностики.", path: "/" });
export default function Page(){ return <Overview/> }
