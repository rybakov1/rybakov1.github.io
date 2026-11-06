import { notFound } from "next/navigation";
import { ReferenceDetail } from "@/components/platform/library";
import { symptoms } from "@/platform/seed";
import { pageMetadata } from "@/lib/seo";
export const dynamicParams = false;
export function generateStaticParams() { return symptoms.map(x => ({ id: x.id })); }
export async function generateMetadata({params}:{params:Promise<{id:string}>}) { const {id}=await params; const x=symptoms.find(a=>a.id===id); return x ? pageMetadata({title:x.title,description:x.summary,path:`/references/symptom/${x.id}/`}) : {}; }
export default async function Page({params}:{params:Promise<{id:string}>}) { const {id}=await params; if(!symptoms.some(x=>x.id===id)) notFound(); return <ReferenceDetail id={`symptom:${id}`}/>; }
