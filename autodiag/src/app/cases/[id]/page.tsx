import { notFound } from "next/navigation";
import { CaseDetail } from "@/components/platform/library";
import { cases } from "@/platform/seed";
import { pageMetadata } from "@/lib/seo";
export const dynamicParams = false;
export function generateStaticParams() { return cases.map(x => ({ id: x.id })); }
export async function generateMetadata({params}:{params:Promise<{id:string}>}) { const {id}=await params; const x=cases.find(a=>a.id===id); return x ? pageMetadata({title:x.title,description:`Учебный пример: ${x.title}. Вымышленный случай диагностики.`,path:`/cases/${x.id}/`}) : {}; }
export default async function Page({params}:{params:Promise<{id:string}>}) { const {id}=await params; if(!cases.some(x=>x.id===id)) notFound(); return <CaseDetail id={id}/>; }
