import { useEffect, useRef, useState } from 'react';
import { Bell, Check, Star } from 'lucide-react';
import type { Product } from '../../lib/types';
import { formatDate, pluralize } from '../../lib/format';
import {safeImageUrl} from '../../lib/browser-import';
export const rub=(v:number|null|undefined)=>v==null?'Нет данных':`${new Intl.NumberFormat('ru-RU',{maximumFractionDigits:0}).format(v)} ₽`;
export const observedPrice=(v:number|null|undefined,currency:string|null|undefined)=>v==null?'Цена не определена':`${new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2}).format(v)} ${currency==='RUB'?'₽':currency||'· валюта неизвестна'}`;
export function SourceImage({url,alt='',...props}:{url?:string|null;alt?:string;loading?:'lazy'|'eager'}){
  const ref=useRef<HTMLImageElement>(null),src=safeImageUrl(url)||'/products/unclassified.svg';
  useEffect(()=>{const image=ref.current;if(image?.complete&&image.naturalWidth===0&&image.getAttribute('src')!=='/products/unclassified.svg')image.src='/products/unclassified.svg';},[src]);
  return <img ref={ref} src={src} alt={alt} {...props} referrerPolicy="no-referrer" onError={event=>{event.currentTarget.onerror=null;event.currentTarget.src='/products/unclassified.svg';}}/>;
}
export function productImage(p:Product){return `/products/${p.image_kind||p.category}.svg`;}
export function WatchButton({product,large=false}:{product:Product;large?:boolean}) {
  const [saved,setSaved]=useState(false);
  useEffect(()=>{try{setSaved((JSON.parse(localStorage.getItem('cenoskop-watchlist')||'[]') as string[]).includes(product.slug));}catch{/* empty local list */}},[product.slug]);
  function toggle(){let list:string[]=[];try{list=JSON.parse(localStorage.getItem('cenoskop-watchlist')||'[]');}catch{/* reset invalid data */}const next=list.includes(product.slug)?list.filter(s=>s!==product.slug):[...list,product.slug];localStorage.setItem('cenoskop-watchlist',JSON.stringify(next));setSaved(next.includes(product.slug));window.dispatchEvent(new Event('watchlist-change'));}
  return <button className={large?'button button-dark':`watch-button ${saved?'saved':''}`} aria-label={saved?'Убрать из отслеживания':'Сохранить для отслеживания'} title={saved?'В вашем списке':'Сохранить в этом браузере'} onClick={toggle} aria-pressed={saved}>{saved?<Check size={large?18:17}/>:<Bell size={large?18:17}/>} {large&&(saved?'В вашем списке':product.record_type==='unverified_listing'?'Сохранить в список':'Отслеживать цену')}</button>;
}
export default function ProductCard({product:p}:{product:Product}){
  const raw=p.record_type==='unverified_listing';
  const observation=p.browser_observation;
  const rating=raw?observation?.rating?.value:p.rating;
  const count=raw?observation?.rating?.review_count:p.reviews_count;
  const price=raw?observedPrice(observation?.offer.price,observation?.offer.currency):rub(p.price);
  return <article className="product-card marketplace-card">
    <div className="product-image-wrap"><a href={`/product/${p.slug}/`} tabIndex={-1} aria-hidden="true">{raw?<SourceImage url={observation?.images?.[0]} loading="lazy"/>:<img src={productImage(p)} alt="" loading="lazy"/>}</a><WatchButton product={p}/>{p.is_demo&&<span className="card-tag">Демо</span>}</div>
    <div className="product-card-body">
      <div className="card-price-row"><strong className="card-price">{price}</strong></div>
      <p className="price-prefix">{raw?'Последний замер · цена могла измениться':p.status==='stale_price'?'Цена устарела':p.price==null?'Текущая цена не подтверждена':'Текущая цена'}</p>
      <a className="product-name" href={`/product/${p.slug}/`}>{p.name}</a>
      <div className="product-reviews"><Star size={15} fill={rating==null?'none':'#f4b740'} color={rating==null?'#9ca3af':'#f4b740'}/>{rating==null?<span>Нет данных о рейтинге</span>:<><strong>{rating.toFixed(1)}</strong>{count!=null&&<span>· {pluralize(count,'отзыв','отзыва','отзывов')}</span>}</>}</div>
      <p className="snapshot-date">{raw?`Замер: ${formatDate(observation?.source.captured_at||null)}`:`Обновлено: ${p.last_updated||'нет даты'}`}</p>
      <a className="card-details" href={`/product/${p.slug}/`}>Подробнее</a>
    </div>
  </article>;
}
