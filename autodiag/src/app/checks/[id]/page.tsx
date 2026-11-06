import { notFound } from "next/navigation";
import { CheckDetail } from "@/components/platform/library";
import { checks } from "@/platform/seed";
import { pageMetadata } from "@/lib/seo";
export const dynamicParams = false;
export function generateStaticParams() { return checks.map(x => ({ id: x.id })); }
export async function generateMetadata({params}:{params:Promise<{id:string}>}) { const {id}=await params; const x=checks.find(a=>a.id===id); return x ? pageMetadata({title:x.title,description:x.goal,path:`/checks/${x.id}/`}) : {}; }
export default async function Page({params}:{params:Promise<{id:string}>}) { const {id}=await params; if(!checks.some(x=>x.id===id)) notFound(); return <CheckDetail id={id}/>; }
