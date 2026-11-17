import { useEffect, useState } from 'react';
import { ArrowUpRight, CheckCircle2, CircleHelp, ListTodo, LoaderCircle, Monitor, Plus, RefreshCw, ShieldCheck, TriangleAlert } from 'lucide-react';
import { PUBLIC_API_ENABLED, PUBLIC_API_URL } from '../../lib/config';
import '../styles/collector-admin.css';

type CanonicalProduct = {id:string;name:string;slug:string;active:boolean;is_demo:boolean};
type JobStatus = 'queued'|'leased'|'completed'|'failed';
type CollectorJob = {id:string;product_id:string;product_name:string;url:string;marketplace:'ozon'|'wildberries';permission_reference:string;status:JobStatus;created_at:string;lease_expires_at:string|null;last_error:string|null;completed_at:string|null;result_product_id:string|null;result_slug:string|null;attempts:number};
type Worker = {worker_id_hash:string;last_seen_at:string};
type CollectorStatus = {enabled:boolean;configured:boolean;lease_seconds:number;counts:Record<JobStatus,number>;workers:Worker[];notice:string};
type FormSubmission = {preventDefault():void};
type ModelDraft = {brand:string;model:string;mpn:string;category:'ssd'|'ram'|'gpu';capacity:string;bundle:string;condition:'new'|'used'|'refurbished'|'unknown';gtin:string};

const labels:Record<JobStatus,string>={queued:'В очереди',leased:'Выдано расширению',completed:'Сохранено',failed:'Ошибка'};

function timestamp(value:string):Date{return new Date(/(?:Z|[+-]\d{2}:\d{2})$/.test(value)?value:`${value}Z`);}
function formatTimestamp(value:string):string{
  const date=timestamp(value);
  return Number.isNaN(date.valueOf())?'Нет данных':new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Moscow'}).format(date);
}

async function collectorRequest<T>(path:string,token:string,method='GET',payload?:unknown):Promise<T>{
  if(!PUBLIC_API_ENABLED)throw new Error('Сбор доступен в серверной версии. Статический сайт не содержит очередь заданий.');
  let response:Response;
  try{response=await fetch(`${PUBLIC_API_URL}${path}`,{method,headers:{Authorization:`Bearer ${token}`,...(payload?{'Content-Type':'application/json'}:{})},...(payload?{body:JSON.stringify(payload)}:{}),signal:AbortSignal.timeout(20000)});}
  catch{throw new Error('Не удалось связаться с сервером очереди. Проверьте запуск API.');}
  const data=await response.json().catch(()=>null) as {detail?:unknown}|null;
  if(!response.ok){const detail=typeof data?.detail==='string'?data.detail:JSON.stringify(data?.detail||'Ошибка запроса');throw new Error(`${response.status}: ${detail}`);}
  return data as T;
}

function marketplaceForUrl(value:string):'ozon'|'wildberries'{
  const url=new URL(value);
  if(url.protocol!=='https:'||url.username||url.password||url.port||url.search||url.hash)throw new Error('Нужна прямая HTTPS-ссылка карточки без параметров, якоря и нестандартного порта.');
  if(['ozon.ru','www.ozon.ru'].includes(url.hostname)&&/^\/product\/(?:[a-zA-Z0-9_-]+-)?[0-9]{1,20}\/?$/.test(url.pathname))return 'ozon';
  if(['wildberries.ru','www.wildberries.ru'].includes(url.hostname)&&/^\/catalog\/[0-9]{1,20}\/detail\.aspx$/.test(url.pathname))return 'wildberries';
  throw new Error('Поддерживаются ссылки карточек ozon.ru/product/…-123/ и wildberries.ru/catalog/123/detail.aspx.');
}

export default function CollectorAdmin({token,products,onProductsChanged}:{token:string;products:CanonicalProduct[];onProductsChanged?:()=>Promise<void>}){
  const [status,setStatus]=useState<CollectorStatus|null>(null),[jobs,setJobs]=useState<CollectorJob[]>([]);
  const [busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(''),[message,setMessage]=useState('');
  const [productId,setProductId]=useState(''),[url,setUrl]=useState(''),[permission,setPermission]=useState(''),[confirmed,setConfirmed]=useState(false);
  const [lastRefresh,setLastRefresh]=useState<string|null>(null);
  const [createdProducts,setCreatedProducts]=useState<CanonicalProduct[]>([]),[modelBusy,setModelBusy]=useState(false);
  const [modelDraft,setModelDraft]=useState<ModelDraft>({brand:'',model:'',mpn:'',category:'ssd',capacity:'',bundle:'retail',condition:'unknown',gtin:''});

  async function refresh(){
    const [state,result]=await Promise.all([collectorRequest<CollectorStatus>('/api/admin/collector/status',token),collectorRequest<{items:CollectorJob[]}>('/api/admin/collector/jobs',token)]);
    setStatus(state);setJobs(result.items);setLastRefresh(new Date().toISOString());
  }
  useEffect(()=>{
    let active=true;
    async function load(){try{const [state,result]=await Promise.all([collectorRequest<CollectorStatus>('/api/admin/collector/status',token),collectorRequest<{items:CollectorJob[]}>('/api/admin/collector/jobs',token)]);if(active){setStatus(state);setJobs(result.items);setError('');setLastRefresh(new Date().toISOString());}}catch(problem){if(active)setError(problem instanceof Error?problem.message:'Очередь недоступна');}finally{if(active)setLoading(false);}}
    void load();const interval=window.setInterval(()=>void load(),15000);return()=>{active=false;window.clearInterval(interval);};
  },[token]);

  async function createJob(event:FormSubmission){
    event.preventDefault();setBusy(true);setError('');setMessage('');
    try{
      if(!confirmed)throw new Error('Подтвердите право на получение и использование данных.');
      if(!productId)throw new Error('Выберите каноническую модель.');
      if(permission.trim().length<8)throw new Error('Укажите действительное основание доступа к данным (от 8 символов).');
      const marketplace=marketplaceForUrl(url.trim());
      await collectorRequest<CollectorJob>('/api/admin/collector/jobs',token,'POST',{product_id:productId,url:url.trim(),marketplace,permission_reference:permission.trim()});
      setUrl('');setConfirmed(false);await refresh();setMessage('Задание добавлено. Получите его в расширении, откройте карточку и проверьте данные перед отправкой.');
    }catch(problem){setError(problem instanceof Error?problem.message:'Не удалось создать задание');}finally{setBusy(false);}
  }
  async function createModel(event:FormSubmission){
    event.preventDefault();setModelBusy(true);setError('');setMessage('');
    try{
      const payload={...modelDraft,name:[modelDraft.brand.trim(),modelDraft.model.trim(),modelDraft.capacity.trim()].join(' '),brand:modelDraft.brand.trim(),model:modelDraft.model.trim(),mpn:modelDraft.mpn.trim(),capacity:modelDraft.capacity.trim(),bundle:modelDraft.bundle.trim(),...(modelDraft.gtin.trim()?{gtin:modelDraft.gtin.trim()}:{gtin:null})};
      const result=await collectorRequest<CanonicalProduct>('/api/admin/products',token,'POST',payload);
      const canonical={...result,active:true,is_demo:false};
      setCreatedProducts(current=>[...current.filter(product=>product.id!==canonical.id),canonical]);setProductId(canonical.id);setModelDraft(current=>({...current,brand:'',model:'',mpn:'',capacity:'',gtin:''}));
      setMessage('Каноническая модель добавлена без цен и предложений. Теперь назначьте ей разрешённую карточку для сбора.');
      if(onProductsChanged)try{await onProductsChanged();}catch{setError('Модель создана, но общий список не обновился. Нажмите «Обновить» в панели.');}
    }catch(problem){setError(problem instanceof Error?problem.message:'Не удалось добавить модель');}finally{setModelBusy(false);}
  }
  const availableProducts=[...products,...createdProducts.filter(created=>!products.some(product=>product.id===created.id))].filter(product=>product.active);
  const enabled=Boolean(status?.enabled&&status.configured);
  return <section className="admin-section collector-admin">
    <div className="admin-section-heading"><div><h2>Сбор через браузер</h2><p className="collector-subtitle">Очередь разрешённых карточек для расширений Chrome и Edge.</p></div><button className="admin-secondary" disabled={busy||loading} onClick={async()=>{setBusy(true);setError('');try{await refresh();}catch(problem){setError(problem instanceof Error?problem.message:'Ошибка обновления');}finally{setBusy(false);}}}><RefreshCw size={15} className={busy?'admin-spin':''}/>Обновить очередь</button></div>
    <div className="collector-explanation"><ShieldCheck size={19}/><p>Оператор задаёт конкретную карточку и основание доступа. Расширение читает открытую страницу после вашего действия; перед отправкой проверяются вариант, продавец и условия цены. Очередь не запускает массовый обход сайта.</p></div>
    {error&&<div className="admin-feedback error" role="alert"><TriangleAlert size={17}/><span>{error}</span></div>}
    {message&&<div className="admin-feedback success" role="status"><CheckCircle2 size={17}/><span>{message}</span></div>}
    {loading?<div className="collector-loading" role="status"><LoaderCircle className="admin-spin" size={21}/>Загружаем состояние очереди…</div>:status&&<>
      <div className="collector-service-state"><span className={`admin-status ${enabled?'positive':'neutral'}`}>{enabled?'Сбор настроен':'Сбор отключён'}</span><p>{status.notice||'Задания выполняются только расширениями с отдельным ключом сборщика.'}</p><span>{lastRefresh&&`Обновлено ${formatTimestamp(lastRefresh)}`}</span></div>
      <div className="collector-counts">{(['queued','leased','completed','failed'] as JobStatus[]).map(key=><div key={key}><span>{labels[key]}</span><strong>{status.counts[key]??0}</strong></div>)}</div>
      {!enabled&&<div className="collector-setup-note"><CircleHelp size={18}/><p>Для включения нужны серверные настройки <code>COLLECTOR_ENABLED</code>, отдельный <code>COLLECTOR_TOKEN</code> и основание доступа <code>COLLECTOR_PERMISSION_REFERENCE</code>. Ключ администратора не передаётся расширению. Инструкция находится в <code>docs/BROWSER_COLLECTOR.md</code>.</p></div>}
      <details className="collector-canonical"><summary><Plus size={16}/><span>Добавить каноническую модель</span><small>Только характеристики, без вымышленных цен</small></summary><form onSubmit={createModel} className="collector-form"><p className="collector-canonical-note">Укажите точный вариант товара. Модель сохраняется без цен и предложений; они появятся после подтверждённого наблюдения.</p><div className="collector-model-grid"><label>Бренд<input value={modelDraft.brand} onChange={event=>setModelDraft(current=>({...current,brand:event.target.value}))} required maxLength={80} placeholder="Samsung" disabled={modelBusy}/></label><label>Модель<input value={modelDraft.model} onChange={event=>setModelDraft(current=>({...current,model:event.target.value}))} required maxLength={150} placeholder="990 PRO" disabled={modelBusy}/></label><label>Артикул производителя (если известен)<input value={modelDraft.mpn} onChange={event=>setModelDraft(current=>({...current,mpn:event.target.value}))} maxLength={120} placeholder="Точный артикул варианта" disabled={modelBusy}/></label><label>Категория<select value={modelDraft.category} onChange={event=>setModelDraft(current=>({...current,category:event.target.value as ModelDraft['category']}))} disabled={modelBusy}><option value="ssd">SSD-накопитель</option><option value="ram">Оперативная память</option><option value="gpu">Видеокарта</option></select></label><label>Объём памяти<input value={modelDraft.capacity} onChange={event=>setModelDraft(current=>({...current,capacity:event.target.value}))} required maxLength={50} placeholder="1 TB / 32 GB / 8 GB" disabled={modelBusy}/></label><label>Комплектность<input value={modelDraft.bundle} onChange={event=>setModelDraft(current=>({...current,bundle:event.target.value}))} required maxLength={100} placeholder="retail / 2 × 16 GB" disabled={modelBusy}/></label><label>Состояние<select value={modelDraft.condition} onChange={event=>setModelDraft(current=>({...current,condition:event.target.value as ModelDraft['condition']}))} disabled={modelBusy}><option value="unknown">Неизвестно</option><option value="new">Новое</option><option value="used">Б/у</option><option value="refurbished">Восстановленное</option></select></label><label>GTIN / EAN (если известен)<input value={modelDraft.gtin} onChange={event=>setModelDraft(current=>({...current,gtin:event.target.value}))} maxLength={20} placeholder="Необязательно" disabled={modelBusy}/></label></div><button className="button" type="submit" disabled={modelBusy}>{modelBusy?<LoaderCircle size={16} className="admin-spin"/>:<Plus size={16}/>}Сохранить модель</button></form></details>
      <div className="collector-columns"><div className="collector-create"><div className="collector-card-heading"><ListTodo size={18}/><h3>Новое задание</h3></div>
        {!availableProducts.length?<div className="collector-no-products"><p>Пока нет канонических моделей для задания.</p><span>Откройте «Добавить каноническую модель» выше и укажите её точный артикул, объём и состояние. После этого можно связать разрешённую карточку с этим вариантом.</span></div>:<form onSubmit={createJob} className="collector-form">
          <label>Каноническая модель<select value={productId} onChange={event=>setProductId(event.target.value)} required disabled={!enabled||busy}><option value="">Выберите конкретный вариант</option>{availableProducts.map(product=><option key={product.id} value={product.id}>{product.name}{product.is_demo?' · демо-модель':''}</option>)}</select></label>
          <label>Ссылка на карточку<input type="url" value={url} onChange={event=>setUrl(event.target.value)} placeholder="https://www.ozon.ru/product/…-123/" required disabled={!enabled||busy}/></label>
          <label>Договор / разрешение / лицензия<input value={permission} onChange={event=>setPermission(event.target.value)} minLength={8} maxLength={500} placeholder="Основание доступа к этой карточке" required disabled={!enabled||busy}/></label>
          <label className="collector-consent"><input type="checkbox" checked={confirmed} onChange={event=>setConfirmed(event.target.checked)} disabled={!enabled||busy} required/><span>У меня есть разрешение на получение, хранение и использование этих данных.</span></label>
          <button className="button" disabled={!enabled||busy||!confirmed} type="submit">{busy?<LoaderCircle className="admin-spin" size={16}/>:<Plus size={16}/>}Добавить в очередь</button>
        </form>}
        <p className="collector-small-note">Задание арендуется на {status.lease_seconds} сек. Истёкшая аренда возвращается в очередь. Ошибку можно исправить и создать новое задание.</p>
      </div><div className="collector-workers"><div className="collector-card-heading"><Monitor size={18}/><h3>Расширения-сборщики</h3><span>{status.workers.length}</span></div>
        {status.workers.length?<ul>{status.workers.map(worker=>{const online=Date.now()-timestamp(worker.last_seen_at).getTime()<5*60*1000;return <li key={worker.worker_id_hash}><div><span className={`collector-worker-dot ${online?'online':''}`}/><strong>Сборщик {worker.worker_id_hash.slice(0,8)}</strong><span className="collector-worker-state">{online?'Недавно на связи':'Давно неактивен'}</span></div><p>Последняя связь: {formatTimestamp(worker.last_seen_at)}</p></li>;})}</ul>:<div className="collector-worker-empty"><Monitor size={28}/><p>Расширения ещё не подключались</p><span>Установите расширение из папки browser-extension, задайте адрес API и отдельный ключ сборщика, затем получите задание.</span></div>}
        <div className="collector-worker-notice">Показаны обезличенные идентификаторы и время последнего обращения. Неактивный сборщик не означает ошибку: браузер может быть закрыт.</div>
      </div></div>
      <div className="collector-jobs-heading"><h3>Последние задания</h3><span>Список обновляется каждые 15 секунд</span></div>
      {jobs.length?<div className="admin-table-wrap"><table className="admin-table collector-jobs"><thead><tr><th>Модель / карточка</th><th>Статус</th><th>Попытки</th><th>Создано / аренда</th><th>Результат</th></tr></thead><tbody>{jobs.map(job=><tr key={job.id}><td><strong>{job.product_name||job.product_id}</strong><a href={job.url} target="_blank" rel="noopener noreferrer">{job.marketplace==='ozon'?'Ozon':'Wildberries'} <ArrowUpRight size={11}/></a><small title={job.permission_reference}>{job.permission_reference}</small></td><td><span className={`admin-status ${job.status==='completed'?'positive':job.status==='failed'?'negative':'neutral'}`}>{labels[job.status]||job.status}</span></td><td>{job.attempts}</td><td>{formatTimestamp(job.created_at)}{job.lease_expires_at&&job.status==='leased'&&<small>Аренда до {formatTimestamp(job.lease_expires_at)}</small>}</td><td>{job.last_error?<span className="collector-job-error">{job.last_error}</span>:job.result_slug?<a href={`/product/${encodeURIComponent(job.result_slug)}/`} target="_blank" rel="noopener noreferrer">Открыть модель <ArrowUpRight size={12}/></a>:job.status==='completed'?'Сохранено':'Ожидает выполнения'}</td></tr>)}</tbody></table></div>:<div className="admin-empty"><ListTodo size={27}/><h3>Очередь пуста</h3><p>Добавьте конкретную карточку, для которой разрешён сбор данных.</p></div>}
    </>}
  </section>;
}
