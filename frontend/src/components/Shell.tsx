import { useEffect, useState } from 'react';
import { Search, Heart } from 'lucide-react';

export function Logo({brand='Ценоскоп'}:{brand?:string}) { return <a className="site-logo" href="/">{brand}<span>.</span></a>; }
export default function Shell({pathname,brand,dataMode='demo'}:{pathname:string;brand:string;dataMode?:string}) {
  const [saved,setSaved]=useState(0);
  useEffect(()=>{const update=()=>{try{setSaved(JSON.parse(localStorage.getItem('cenoskop-watchlist')||'[]').length);}catch{setSaved(0);}};update();window.addEventListener('watchlist-change',update);return()=>window.removeEventListener('watchlist-change',update);},[]);
  const nav=[['/catalog/','Каталог'],['/deals/','Снижения цен'],['/tracking/','Личный кабинет'],['/import/','Импорт JSON'],['/admin/','Управление'],['/methodology/','О сервисе']];
  return <header className="site-header"><div className="header-main"><Logo brand={brand}/><form className="header-search" action="/catalog/"><Search size={20}/><input name="q" placeholder="Найти товар или модель" aria-label="Поиск товаров"/><button type="submit">Найти</button></form><a className="header-saved" href="/tracking/" aria-label={`Личный кабинет, сохранённых товаров: ${saved}`}><Heart size={22}/><span>Личный кабинет</span>{saved>0&&<b>{saved}</b>}</a></div><div className="header-nav-wrap"><nav className="header-nav" aria-label="Основная навигация">{nav.map(([href,label])=><a key={href} className={pathname===href?'active':''} href={href}>{label}</a>)}</nav><span className="header-mode">{dataMode==='unavailable'?'Нет связи':dataMode==='demo'?'Демо':dataMode==='mixed'?'Демо и импорт':'Данные каталога'}</span></div></header>;
}
