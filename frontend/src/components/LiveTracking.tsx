import {useEffect,useState} from 'react';
import {getProductsResult,getAppConfig} from '../../lib/data';
import type {AppConfig,ProductDetail} from '../../lib/types';
import Tracking from './Tracking';

export default function LiveTracking(){
  const [state,setState]=useState<{items:ProductDetail[];config:AppConfig;available:boolean}|null>(null);
  useEffect(()=>{let active=true;Promise.all([getProductsResult(),getAppConfig()]).then(([result,config])=>{if(active)setState({...result,config});});return()=>{active=false;};},[]);
  if(!state)return <p role="status">Загружаем сохранённые товары…</p>;
  return <Tracking products={state.items} config={state.config} unavailable={!state.available}/>;
}
