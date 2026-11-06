import { notFound } from "next/navigation";
import { ArticleDetail } from "@/components/platform/library";
import { articles } from "@/platform/seed";
import { pageMetadata } from "@/lib/seo";
export const dynamicParams = false;
export function generateStaticParams() { return articles.map(x => ({ id: x.id })); }
export async function generateMetadata({params}:{params:Promise<{id:string}>}) { const {id}=await params; const x=articles.find(a=>a.id===id); return x ? pageMetadata({title:x.title,description:x.summary,path:`/knowledge/${x.id}/`}) : {}; }
export default async function Page({params}:{params:Promise<{id:string}>}) { const {id}=await params; if(!articles.some(x=>x.id===id)) notFound(); return <ArticleDetail id={id}/>; }
