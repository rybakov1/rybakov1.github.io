import { notFound } from "next/navigation";
import { ReferenceDetail } from "@/components/platform/library";
import { dtcs } from "@/platform/seed";
import { pageMetadata, absoluteUrl } from "@/lib/seo";
import { codes as legacyCodes } from "@/data/content";
export const dynamicParams = false;
export function generateStaticParams() { return dtcs.map(x => ({ id: x.id })); }
export async function generateMetadata({params}:{params:Promise<{id:string}>}) { const {id}=await params; const x=dtcs.find(a=>a.id===id); if (!x) return {}; const metadata=pageMetadata({title:`${x.code} — ${x.title}`,description:x.summary,path:`/references/dtc/${x.id}/`}); const legacy=legacyCodes.find(c=>c.slug===x.id&&c.status!=="draft"); return legacy ? {...metadata,alternates:{canonical:absoluteUrl(`/codes/${legacy.slug}/`)}} : metadata; }
export default async function Page({params}:{params:Promise<{id:string}>}) { const {id}=await params; if(!dtcs.some(x=>x.id===id)) notFound(); return <ReferenceDetail id={`dtc:${id}`}/>; }
