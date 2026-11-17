import { useEffect, useState } from 'react';
import { loadBrowserListings, type BrowserListing } from '../../lib/browser-listings';
import { PUBLIC_API_ENABLED, PUBLIC_API_URL } from '../../lib/config';
import type { CategoryId } from '../../lib/types';

const categories:Record<'unclassified'|'gpu'|'ssd'|'ram',string>={unclassified:'Не классифицировано',gpu:'Видеокарты',ssd:'SSD-накопители',ram:'Оперативная память'};
type Category = keyof typeof categories;
export default function BrowserModeration({token,save}:{token:string;save:(id:string,patch:{category?:Category;visible?:boolean})=>Promise<unknown>}){
  const [items,setItems]=useState<BrowserListing[]>([]),[drafts,setDrafts]=useState<Record<string,Category>>({});
  const [query,setQuery]=useState(''),[loading,setLoading]=useState(true),[saving,setSaving]=useState<string|null>(null),[notice,setNotice]=useState(''),[error,setError]=useState('');
  async function load(){
    setLoading(true);setError('');
    try{
      if(!PUBLIC_API_ENABLED)throw Error('Каталог недоступен. Проверьте подключение API.');
      const rows=await loadBrowserListings(PUBLIC_API_URL,token);
      setItems(rows);setDrafts(Object.fromEntries(rows.map(item=>[item.id,(item.category in categories?item.category:'unclassified') as Category])));
    }catch(problem){setError(problem instanceof Error?problem.message:'Не удалось загрузить карточки.');}
    finally{setLoading(false);}
  }
  useEffect(()=>{void load();},[]);
  async function apply(item:BrowserListing){
    const category=drafts[item.id];if(!category)return;
    setSaving(item.id);setError('');setNotice('');
    try{await save(item.id,{category});setItems(previous=>previous.map(row=>row.id===item.id?{...row,category:category as CategoryId}:row));setNotice('Категория сохранена.');}
    catch(problem){setError(problem instanceof Error?problem.message:'Не удалось сохранить категорию.');}
    finally{setSaving(null);}
  }
  async function toggle(item:BrowserListing){
    const visible=!item.visible;setSaving(item.id);setError('');setNotice('');
    try{await save(item.id,{visible});setItems(previous=>previous.map(row=>row.id===item.id?{...row,visible}:row));setNotice(visible?'Карточка снова видна в каталоге.':'Карточка скрыта; её наблюдения сохранены.');}
    catch(problem){setError(problem instanceof Error?problem.message:'Не удалось изменить видимость.');}
    finally{setSaving(null);}
  }
  const shown=items.filter(item=>`${item.name} ${item.browser_observation?.product.sku||''}`.toLocaleLowerCase('ru-RU').includes(query.trim().toLocaleLowerCase('ru-RU')));
  return <section className="admin-section"><div className="admin-section-heading"><h2>Карточки JSON</h2><button type="button" className="admin-secondary" disabled={loading||saving!==null} onClick={()=>void load()}>Обновить</button></div>
    <p className="admin-section-note">Категория определяется автоматически по названию, если это возможно. При необходимости её можно изменить или скрыть ошибочную карточку.</p>
    <label className="admin-browser-search">Поиск по названию или SKU <input className="admin-search" value={query} onChange={event=>setQuery(event.target.value)}/></label>
    {error&&<p className="admin-feedback error" role="alert">{error}</p>}{notice&&<p className="admin-feedback success" role="status">{notice}</p>}
    {loading?<p>Загружаем карточки…</p>:shown.length?<div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Карточка</th><th>Категория</th><th>Видимость</th></tr></thead><tbody>{shown.map(item=><tr key={item.id}><td>{item.visible?<a href={`/product/${encodeURIComponent(item.slug)}/`} target="_blank" rel="noopener noreferrer">{item.name}</a>:<strong>{item.name}</strong>}<small>SKU {item.browser_observation?.product.sku||'неизвестен'}</small></td><td><select aria-label={`Категория: ${item.name}`} value={drafts[item.id]||'unclassified'} disabled={saving!==null} onChange={event=>setDrafts(previous=>({...previous,[item.id]:event.target.value as Category}))}>{Object.entries(categories).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select> <button type="button" className="admin-small-button confirm" disabled={saving!==null||drafts[item.id]===item.category} onClick={()=>void apply(item)}>Сохранить</button></td><td><span>{item.visible?'В каталоге':'Скрыта'}</span> <button type="button" className="admin-small-button" disabled={saving!==null} onClick={()=>void toggle(item)}>{item.visible?'Скрыть':'Показать'}</button></td></tr>)}</tbody></table></div>:<div className="admin-empty"><h3>Карточек не найдено</h3><p>Импортируйте JSON или измените запрос.</p></div>}
  </section>;
}
