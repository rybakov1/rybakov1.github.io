import { notFound } from "next/navigation";
import { AlgorithmDetail } from "@/components/platform/library";
import { algorithms } from "@/platform/seed";
import { pageMetadata } from "@/lib/seo";
export const dynamicParams = false;
export function generateStaticParams() { return algorithms.filter(a => a.status === "published").map(a => ({ id: a.id })); }
export async function generateMetadata({params}:{params:Promise<{id:string}>}) { const {id}=await params; const a=algorithms.find(x=>x.id===id&&x.status==="published"); return a ? pageMetadata({title:a.title,description:a.summary,path:`/algorithms/${a.id}/`}) : {}; }
export default async function Page({params}:{params:Promise<{id:string}>}) { const {id}=await params; if(!algorithms.some(x=>x.id===id&&x.status==="published")) notFound(); return <AlgorithmDetail id={id}/>; }
