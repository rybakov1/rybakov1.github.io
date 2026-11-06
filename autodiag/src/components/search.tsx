"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Search, X } from "lucide-react";
import type { CodeItem } from "@/data/content";

export function SearchBox({ codes, compact = false }: { codes: CodeItem[]; compact?: boolean }) {
  const [query, setQuery] = useState("");
  const matches = query.trim() ? codes.filter(c => `${c.code} ${c.title} ${c.summary}`.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 5) : [];
  return <div className={`search-wrap ${compact ? "compact" : ""}`}><div className="search-box"><Search size={21} aria-hidden="true"/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Например, P0420 или P0300" aria-label="Поиск по коду ошибки" autoComplete="off"/>{query && <button className="clear" onClick={() => setQuery("")} aria-label="Очистить поиск"><X size={18}/></button>}<Link className="search-button" href={matches[0] ? `/codes/${matches[0].slug}/` : "/codes/"}>Найти <ArrowRight size={17}/></Link></div>{query && <div className="search-results">{matches.length ? matches.map(c => <Link key={c.slug} href={`/codes/${c.slug}/`}><b>{c.code}</b><span>{c.title}</span><ArrowRight size={16}/></Link>) : <p>Ничего не найдено. Проверьте код или откройте каталог.</p>}</div>}</div>
}
export function CodeCatalog({ codes }: { codes: CodeItem[] }) {
 const [query,setQuery]=useState(""); const [group,setGroup]=useState("Все"); const [system,setSystem]=useState("Все системы"); const [page,setPage]=useState(1);
 const systems = Array.from(new Set(codes.map(c=>c.system)));
 const filtered=codes.filter(c=>(group==="Все" || c.group===group) && (system==="Все системы" || c.system===system) && `${c.code} ${c.title} ${c.summary}`.toLowerCase().includes(query.toLowerCase().trim()));
 const max=Math.max(1,Math.ceil(filtered.length/9)); const safePage=Math.min(page,max);
 return <><div className="catalog-tools"><div className="catalog-search"><Search size={19}/><input aria-label="Поиск кода" placeholder="Поиск по коду или названию" value={query} onChange={e=>{setQuery(e.target.value);setPage(1)}}/></div><select aria-label="Система автомобиля" value={system} onChange={e=>{setSystem(e.target.value);setPage(1)}}><option>Все системы</option>{systems.map(s=><option key={s}>{s}</option>)}</select></div><div className="filter-row"><span>ГРУППА КОДА</span>{["Все","P","B","C","U"].map(g=><button className={group===g ? "active" : ""} key={g} onClick={()=>{setGroup(g);setPage(1)}}>{g}</button>)}<small>Найдено: {filtered.length}</small></div><div className="catalog-grid">{filtered.slice((safePage-1)*9,safePage*9).map(c=><Link className="catalog-card" href={`/codes/${c.slug}/`} key={c.slug}><div><span className="code-badge">{c.code}</span><ArrowRight size={18}/></div><h3>{c.title}</h3><p>{c.summary}</p><span className="card-system">{c.system}</span></Link>)}</div>{filtered.length===0 && <div className="empty-state">По вашему запросу ничего не найдено. Попробуйте изменить фильтры.</div>}{max>1 && <div className="pagination"><button disabled={safePage===1} onClick={()=>setPage(safePage-1)}>← Назад</button><span>{safePage} / {max}</span><button disabled={safePage===max} onClick={()=>setPage(safePage+1)}>Далее →</button></div>}</>
}
