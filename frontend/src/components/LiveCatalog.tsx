import {useEffect, useState} from 'react';
import Catalog from './Catalog';
import {getProductsResult} from '../../lib/data';
import type {ProductDetail} from '../../lib/types';

export default function LiveCatalog({initialCategory='all',deals=false}:{initialCategory?:string;deals?:boolean}){
  const [state,setState]=useState<{loading:boolean;available:boolean;items:ProductDetail[]}>({loading:true,available:true,items:[]});
  useEffect(()=>{let active=true;getProductsResult().then(result=>{if(active)setState({...result,loading:false});}).catch(()=>{if(active)setState({loading:false,available:false,items:[]});});return()=>{active=false;};},[]);
  if(state.loading)return <p role="status">Загружаем каталог…</p>;
  return <Catalog products={state.items} initialCategory={initialCategory} deals={deals} unavailable={!state.available}/>;
}
