import Link from "next/link";
import { ArrowRight, ArrowUpRight, ChevronRight, CircleGauge, BookOpen, Wrench } from "lucide-react";
import { notFound } from "next/navigation";
import { codes, symptoms, indicators, guides } from "@/data/content";
import { CodeCatalog } from "@/components/search";
import { CodesHub, SymptomsHub } from "@/components/platform/library";
import { pageMetadata } from "@/lib/seo";

const sections = {
 codes: { name: "Коды ошибок", title: "Справочник кодов OBD-II", description: "Найдите код и узнайте, что он означает, какие системы проверить и когда обратиться к специалисту.", items: codes },
 symptoms: { name: "Симптомы", title: "Что происходит с автомобилем?", description: "Выберите знакомый симптом, чтобы разобраться в возможных причинах и следующих шагах.", items: symptoms },
 dashboard: { name: "Индикаторы", title: "Индикаторы приборной панели", description: "Разбираемся, что означают сигналы автомобиля и как действовать безопасно.", items: indicators },
 guides: { name: "Инструкции", title: "Полезные инструкции", description: "Практические материалы, которые помогут разобраться в автомобильной диагностике.", items: guides },
} as const;
type Section = keyof typeof sections;
export function generateStaticParams() { return Object.keys(sections).map(section => ({ section })); }
export async function generateMetadata({ params }: { params: Promise<{section:string}> }) { const {section}=await params; const data=sections[section as Section]; if (!data) return {}; return pageMetadata({title:data.title,description:data.description,path:`/${section}/`}); }
export default async function Category({ params }: { params: Promise<{section:string}> }) {
 const {section}=await params; if(section==="codes") return <CodesHub/>; if(section==="symptoms") return <SymptomsHub/>; const data=sections[section as Section]; if (!data) notFound(); const items=data.items.filter(i=>i.status!=="draft");
 return <><div className="page-hero"><div className="shell"><div className="breadcrumbs"><Link href="/">Главная</Link><ChevronRight size={14}/><span>{data.name}</span></div><div className="kicker"><span>СПРАВОЧНИК</span> / {data.name.toUpperCase()}</div><h1>{data.title}<span className="orange">.</span></h1><p>{data.description}</p></div></div><div className="shell content-section"><div className="demo-notice"><strong>Демонстрационная версия</strong> Материалы ожидают редакционной проверки и не заменяют документацию производителя.</div>{section==="codes" ? <CodeCatalog codes={codes.filter(i=>i.status!=="draft")}/> : <><div className="list-head"><div><span className="kicker">ВЫБЕРИТЕ ТЕМУ</span><h2>{data.name}</h2></div><span>{items.length} материалов</span></div><div className="catalog-grid">{items.map((item,i)=><Link className="catalog-card topic-card" href={`/${section}/${item.slug}/`} key={item.slug}><div><span className="topic-icon">{section==="dashboard"?<CircleGauge size={22}/>:section==="symptoms"?<Wrench size={22}/>:<BookOpen size={22}/>}</span><ArrowUpRight size={18}/></div><span className="topic-index">0{i+1} / {item.category}</span><h3>{item.title}</h3><p>{item.summary}</p><span className="topic-more">Подробнее <ArrowRight size={15}/></span></Link>)}</div></>}</div></>
}

