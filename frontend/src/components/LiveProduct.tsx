import {useEffect, useState} from 'react';
import {getProductResult,getAppConfig} from '../../lib/data';
import type {AppConfig,ProductDetail as Product} from '../../lib/types';
import ProductDetail from './ProductDetail';
import BrowserListing from './BrowserListing';

export default function LiveProduct(){
  const [state,setState]=useState<{loading:boolean;available:boolean;product:Product|null;config:AppConfig|null}>({loading:true,available:true,product:null,config:null});
  useEffect(()=>{let active=true;const slug=new URLSearchParams(window.location.search).get('slug');if(!slug){setState({loading:false,available:true,product:null,config:null});return;}
    Promise.all([getProductResult(slug),getAppConfig()]).then(([result,config])=>{if(active)setState({...result,config,loading:false});}).catch(()=>{if(active)setState({loading:false,available:false,product:null,config:null});});return()=>{active=false;};},[]);
  if(state.loading)return <p role="status">Загружаем товар…</p>;
  if(!state.product||!state.config)return <div className="empty-state" role="alert"><h1>{state.available?'Товар не найден':'Карточка временно недоступна'}</h1><p>{state.available?'Возможно, товар был скрыт или удалён.':'Не удалось загрузить данные. Попробуйте позже.'}</p><a href="/catalog/" className="button button-light">Открыть каталог</a></div>;
  return state.product.record_type==='unverified_listing'?<BrowserListing product={state.product}/>:<ProductDetail product={state.product} config={state.config}/>;
}
