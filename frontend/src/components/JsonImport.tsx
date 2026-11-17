import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowUpRight, CheckCircle2, ChevronDown, FileJson, FileUp, FolderOpen, Info, Search, ShieldCheck, Trash2, TriangleAlert } from 'lucide-react';
import { parseBrowserExport, formatIssue, type BrowserExportFile, type BrowserObservation } from '../../lib/browser-import';
import { PUBLIC_API_URL, PUBLIC_API_ENABLED } from '../../lib/config';
import '../styles/json-import.css';

const STORAGE_KEY='cenoskop.browser-import.v1';
const MAX_BYTES=5_000_000;
const RECEIPT_KEY='cenoskop.browser-import.receipt.v1';
type ImportRecord={filename:string;imported_at:string;data:BrowserExportFile};
type ServerImportResult={imported:number;duplicates:number;total_listings:number;source_id?:string};
type ServerReceipt=ServerImportResult&{filename:string;imported_at:string};

function date(value:string|null|undefined){
  if(!value)return 'Дата неизвестна';
  const parsed=new Date(value);
  return Number.isNaN(parsed.valueOf())?'Дата неизвестна':parsed.toLocaleString('ru-RU',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Moscow'});
}
function price(row:BrowserObservation){
  if(row.offer.price==null)return 'Цена не определена';
  return `${new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2}).format(row.offer.price)} ${row.offer.currency==='RUB'?'₽':row.offer.currency||'(валюта неизвестна)'}`;
}
function text(value:string|null|undefined){return value||'Неизвестно';}
const regionName=(value:string|null)=>value==='RU-SPE'?'Санкт-Петербург':value==='RU-MOW'?'Москва':text(value);
const conditionName=(value:string)=>({new:'Новое',used:'Б/у',refurbished:'Восстановленное',unknown:'Не подтверждено'}[value]||'Не подтверждено');
const paymentName=(value:string|null)=>value?({other_bank_card:'С другими банками',any_card:'Любая карта',marketplace_card:'Карта маркетплейса',wallet:'Кошелёк площадки',installment:'Рассрочка'}[value]||value):'Неизвестно';

function Observation({row,index}:{row:BrowserObservation;index:number}){
  const needsReview=row.needs_review||!row.identity_confirmed;
  return <article className="ji-observation">
    <div className="ji-observation-top"><span className="ji-observation-index">{String(index+1).padStart(2,'0')}</span><span className="ji-marketplace">{row.source.marketplace}</span><span className={`ji-badge ${needsReview?'review':'ok'}`}>{needsReview?<TriangleAlert size={12}/>:<CheckCircle2 size={12}/>} {needsReview?'Требует проверки':'Поля извлечены'}</span><time>{date(row.source.captured_at)}</time></div>
    <div className="ji-observation-main"><div><h3>{row.product.title||'Название не определено'}</h3><p className="ji-identity-line">{row.product.brand||'Бренд неизвестен'}<span>·</span>SKU {row.product.sku||'неизвестен'}{row.product.capacity&&<><span>·</span>{row.product.capacity}</>}</p></div><strong className={`ji-price ${row.offer.price==null?'unknown':''}`}>{price(row)}</strong></div>
    <div className="ji-context"><span>Регион: <strong>{regionName(row.offer.region)}</strong></span><span>Оплата: <strong>{paymentName(row.offer.payment_condition)}</strong></span><span>Продавец: <strong>{text(row.offer.seller.name)}</strong></span></div>
    {row.review_reasons.length>0&&<div className="ji-reasons">{row.review_reasons.map(reason=><span key={reason}>{formatIssue(reason)}</span>)}</div>}
    <details className="ji-row-details"><summary>Данные наблюдения <ChevronDown size={14}/></summary><dl className="ji-detail-grid"><div><dt>Модель</dt><dd>{text(row.product.model)}</dd></div><div><dt>MPN производителя</dt><dd>{text(row.product.mpn)}</dd></div><div><dt>Комплектность</dt><dd>{text(row.product.bundle)}</dd></div><div><dt>Состояние</dt><dd>{conditionName(row.product.condition)}</dd></div><div><dt>Тип цены</dt><dd>{row.offer.price_type?({regular:'Обычная',membership:'Клубная / по карте',installment:'Рассрочка'}[row.offer.price_type]||row.offer.price_type):'Неизвестно'}</dd></div><div><dt>Наличие</dt><dd>{row.offer.availability===null?'Неизвестно':row.offer.availability?'В наличии':'Недоступно'}</dd></div><div><dt>Гарантия</dt><dd>{row.offer.warranty_months==null?'Неизвестна':`${row.offer.warranty_months} мес.`}</dd></div><div><dt>Метод извлечения</dt><dd>{row.source.extraction_method}</dd></div></dl><a href={row.source.url} target="_blank" rel="noopener noreferrer" className="ji-source-link">Открыть источник <ArrowUpRight size={14}/><span>{row.source.url}</span></a>{row.candidates.length>0&&<details className="ji-candidates"><summary>Найденные варианты цены ({row.candidates.length})</summary><pre>{JSON.stringify(row.candidates,null,2)}</pre></details>}<p className="ji-row-note">Точное соответствие канонической модели {row.identity_confirmed?'указано в файле; отдельно здесь не проверялось':'не подтверждено'}. Рейтинги и история по этому файлу не создаются.</p></details>
  </article>;
}

export default function JsonImport(){
  const [saved,setSaved]=useState<ImportRecord|null>(null),[preview,setPreview]=useState<ImportRecord|null>(null),[error,setError]=useState(''),[message,setMessage]=useState(''),[dragging,setDragging]=useState(false),[busy,setBusy]=useState(false),[query,setQuery]=useState(''),[reviewOnly,setReviewOnly]=useState(false);
  const [adminToken,setAdminToken]=useState(''),[serverBusy,setServerBusy]=useState(false),[receipt,setReceipt]=useState<ServerReceipt|null>(null),[serverError,setServerError]=useState('');
  const input=useRef<HTMLInputElement>(null),loadRevision=useRef(0);
  useEffect(()=>{
    try{
      const rawReceipt=localStorage.getItem(RECEIPT_KEY);
      if(rawReceipt){const item=JSON.parse(rawReceipt) as Partial<ServerReceipt>;if(typeof item.filename==='string'&&typeof item.imported_at==='string'&&typeof item.imported==='number'&&typeof item.duplicates==='number'&&typeof item.total_listings==='number')setReceipt({filename:item.filename,imported_at:item.imported_at,imported:item.imported,duplicates:item.duplicates,total_listings:item.total_listings});}
    }catch{/* A damaged optional receipt never blocks reading the selected file. */}
    try{
      const raw=localStorage.getItem(STORAGE_KEY);if(!raw)return;
      const value=JSON.parse(raw) as Partial<ImportRecord>;
      if(typeof value.filename!=='string'||typeof value.imported_at!=='string'||!value.data)throw new Error('Повреждена сохранённая выгрузка.');
      setSaved({filename:value.filename,imported_at:value.imported_at,data:parseBrowserExport(JSON.stringify(value.data))});
    }catch{setError('Сохранённый файл не удалось прочитать. Загрузите JSON заново. Данные в хранилище не изменены.');}
  },[]);
  async function loadFile(file:File){
    if(serverBusy){setError('Дождитесь завершения добавления в каталог, затем выберите другой файл.');return;}
    const revision=++loadRevision.current;setError('');setMessage('');setBusy(false);
    if(!file.name.toLowerCase().endsWith('.json')){setError('Выберите JSON-файл, выгруженный расширением Ценоскоп.');return;}
    if(file.size>MAX_BYTES){setError('Файл больше 5 МБ. Разделите сбор на несколько выгрузок.');return;}
    setBusy(true);
    try{
      const data=parseBrowserExport(await file.text());
      if(revision!==loadRevision.current)return;
      setPreview({filename:file.name.slice(0,250),imported_at:new Date().toISOString(),data});setReceipt(null);setServerError('');setQuery('');setReviewOnly(false);
    }catch(problem){if(revision===loadRevision.current)setError(problem instanceof Error?problem.message:'Не удалось прочитать JSON.');}
    finally{if(revision===loadRevision.current)setBusy(false);}
  }
  function save(){
    if(!preview)return;
    try{
      const record={...preview,imported_at:new Date().toISOString()};
      localStorage.setItem(STORAGE_KEY,JSON.stringify(record));
      setSaved(record);setPreview(null);setError('');setMessage(`Сохранено ${record.data.observations.length} наблюдений для просмотра в этом браузере. Для каталога используйте кнопку «Добавить в каталог сайта».`);
    }catch{setError('Не удалось сохранить файл: локальное хранилище недоступно или заполнено. Предыдущий импорт сохранён, новый файл остаётся в предпросмотре.');}
  }
  async function upload(){
    const record=preview||saved;if(!record||serverBusy||busy)return;
    setServerError('');setMessage('');
    if(!PUBLIC_API_ENABLED){setServerError('Эта статическая версия не подключена к серверу. Откройте полную локальную версию после запуска scripts/start-dev.ps1.');return;}
    if(!adminToken.trim()){setServerError('Введите ключ администратора ADMIN_TOKEN из .env сервера. Ключ останется только в памяти этой вкладки.');return;}
    let endpoint:URL;
    try{
      const origin=new URL(PUBLIC_API_URL);
      if(origin.username||origin.password||origin.search||origin.hash||!['','/'].includes(origin.pathname)||(origin.protocol!=='https:'&&!(origin.protocol==='http:'&&['localhost','127.0.0.1'].includes(origin.hostname))))throw new Error();
      endpoint=new URL('/api/admin/browser-import',origin);
    }catch{setServerError('Некорректно настроен адрес API сайта. Проверьте PUBLIC_API_URL на сервере.');return;}
    setServerBusy(true);
    try{
      let response:Response;
      try{response=await fetch(endpoint,{method:'POST',headers:{Authorization:`Bearer ${adminToken.trim()}`,'Content-Type':'application/json'},body:JSON.stringify({filename:record.filename,content:JSON.stringify(record.data)}),signal:AbortSignal.timeout(30000),credentials:'omit',redirect:'error'});}
      catch{throw new Error('Сервер недоступен. Запустите scripts/start-dev.ps1 из папки проекта и повторите добавление. Сохранение для просмотра не добавляет записи в каталог.');}
      const payload=await response.json().catch(()=>null) as (Partial<ServerImportResult>&{detail?:unknown})|null;
      if(!response.ok){
        if(response.status===401)throw new Error('Ключ администратора не принят. Используйте ADMIN_TOKEN из .env, не ключ расширения.');
        if(response.status===503)throw new Error('Серверный импорт отключён. Настройте ADMIN_TOKEN и перезапустите scripts/start-dev.ps1.');
        if(response.status===404)throw new Error('На сервере ещё нет импорта JSON. Перезапустите обновлённый backend через scripts/stop-dev.ps1 и scripts/start-dev.ps1.');
        const detail=typeof payload?.detail==='string'?payload.detail:'Проверьте JSON и повторите добавление.';
        throw new Error(`Импорт отклонён (${response.status}): ${detail}`);
      }
      if(!payload||typeof payload.imported!=='number'||typeof payload.duplicates!=='number'||typeof payload.total_listings!=='number')throw new Error('Сервер вернул неполный результат. Обновите каталог и проверьте список перед повтором.');
      const result:ServerReceipt={filename:record.filename,imported_at:new Date().toISOString(),imported:payload.imported,duplicates:payload.duplicates,total_listings:payload.total_listings};
      setReceipt(result);
      try{localStorage.setItem(RECEIPT_KEY,JSON.stringify(result));}catch{/* Server import has succeeded even when the local receipt cannot be stored. */}
      setMessage(`Добавлено наблюдений: ${result.imported}. Повторов: ${result.duplicates}. В серверном списке импортированных карточек: ${result.total_listings}.`);
    }catch(problem){setServerError(problem instanceof Error?problem.message:'Не удалось добавить записи в каталог.');}
    finally{setServerBusy(false);}
  }
  function clear(){
    if(!saved||!window.confirm('Удалить сохранённый импорт из этого браузера? Исходный JSON в папке загрузок останется.'))return;
    try{localStorage.removeItem(STORAGE_KEY);setSaved(null);setError('');setMessage('Локальный импорт удалён. Исходный файл не изменён.');}
    catch{setError('Не удалось очистить локальное хранилище. Данные оставлены без изменений.');}
  }
  function download(){
    const record=preview||saved;if(!record)return;
    const blob=new Blob([JSON.stringify(record.data,null,2)],{type:'application/json;charset=utf-8'}),url=URL.createObjectURL(blob),anchor=document.createElement('a');
    anchor.href=url;anchor.download=`cenoskop-import-${new Date().toISOString().slice(0,10)}.json`;document.body.append(anchor);anchor.click();anchor.remove();window.setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  const active=preview||saved,rows=active?.data.observations||[];
  const filtered=useMemo(()=>rows.map((row,index)=>({row,index})).filter(({row})=>(!reviewOnly||row.needs_review||!row.identity_confirmed)&&(!query||[row.product.title,row.product.brand,row.product.model,row.product.mpn,row.product.sku].join(' ').toLocaleLowerCase('ru-RU').includes(query.toLocaleLowerCase('ru-RU').trim()))),[rows,reviewOnly,query]);
  const reviewCount=rows.filter(row=>row.needs_review||!row.identity_confirmed).length,priceCount=rows.filter(row=>row.offer.price!=null).length;
  return <div className="ji-root">
    <section className="ji-scope"><ShieldCheck size={23}/><div><strong>Добавьте выгрузку в каталог сайта</strong><p>Выбор файла открывает предпросмотр. Кнопка «Добавить в каталог сайта» сохраняет записи на сервере и делает их видимыми в каталоге. Сборщик расширения по-прежнему работает без API.</p></div><span>JSON → КАТАЛОГ</span></section>
    <div className="ji-steps"><span><b>01</b>Выберите JSON</span><span><b>02</b>Проверьте наблюдения</span><span><b>03</b>Добавьте в каталог сайта</span></div>
    <section className={`ji-upload ${dragging?'dragging':''}`} onDragOver={event=>{event.preventDefault();setDragging(true);}} onDragLeave={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node|null))setDragging(false);}} onDrop={event=>{event.preventDefault();setDragging(false);const files=event.dataTransfer.files;if(files.length!==1){setError('Выберите один JSON-файл за раз.');return;}void loadFile(files[0]);}}>
      <span className="ji-upload-icon"><FileJson size={28}/></span><div><h2>{busy?'Читаем и проверяем файл…':'Перетащите сюда выгрузку'}</h2><p>cenoskop-*.json · Формат расширения v1 · до 5 МБ</p><span>Файл в папке «Загрузки» не изменяется.</span></div><button className="ji-button accent" onClick={()=>input.current?.click()} disabled={busy||serverBusy}><FolderOpen size={17}/>Выбрать файл</button><input ref={input} className="ji-file-input" type="file" accept=".json,application/json" aria-label="Выбрать JSON-выгрузку" onChange={event=>{const file=event.target.files?.[0];if(file)void loadFile(file);event.target.value='';}}/>
    </section>
    {error&&<div className="ji-feedback error" role="alert"><TriangleAlert size={18}/><p>{error}</p></div>}{message&&<div className="ji-feedback success" role="status"><CheckCircle2 size={18}/><p>{message}</p></div>}
    {preview&&<section className="ji-preview-bar"><div><span className="ji-badge review">ПРЕДПРОСМОТР</span><strong>{preview.filename}</strong><p>{saved?'Новый файл заменит предыдущий локальный импорт после нажатия кнопки.':'Файл проверен. Для серверного списка используйте кнопку добавления в каталог ниже.'}</p></div><div className="ji-preview-actions"><button className="ji-button subtle" disabled={serverBusy} onClick={()=>{loadRevision.current++;setBusy(false);setPreview(null);setError('');}}>Отменить</button><button className="ji-button subtle" onClick={save} disabled={serverBusy}><FileUp size={16}/>Сохранить для просмотра</button></div></section>}
    {!preview&&saved&&<section className="ji-saved-bar"><div><CheckCircle2 size={18}/><strong>{saved.filename}</strong><span>Для локального просмотра · {date(saved.imported_at)}</span></div><button className="ji-text-button" onClick={clear}><Trash2 size={14}/>Удалить локальный импорт</button></section>}
    {active&&<section className="ji-server-import" aria-labelledby="ji-server-title"><div className="ji-server-heading"><span className="ji-server-icon"><FileUp size={23}/></span><div><span className="ji-server-eyebrow">СОХРАНЕНИЕ НА СЕРВЕРЕ</span><h2 id="ji-server-title">Добавить записи в каталог</h2><p>{active.filename} · {active.data.observations.length} наблюдений</p></div></div><p className="ji-server-note">Записи появятся в каталоге с пометкой «Непроверенная карточка». Неизвестные поля сохранятся, похожие модели автоматически не объединятся. Для этого действия сервер сайта должен работать.</p><form className="ji-server-form" onSubmit={event=>{event.preventDefault();void upload();}}><label htmlFor="ji-admin-token">Ключ администратора<input id="ji-admin-token" type="password" value={adminToken} onChange={event=>setAdminToken(event.target.value)} autoComplete="off" placeholder="ADMIN_TOKEN из .env сервера" disabled={serverBusy} required/></label><button className="ji-button accent" type="submit" disabled={serverBusy||busy||!adminToken.trim()}><FileUp size={16}/>{serverBusy?'Добавляем в каталог…':'Добавить в каталог сайта'}</button></form><p className="ji-server-hint">Ключ хранится только в памяти этой вкладки. Если сервер выключен, запустите <code>scripts/start-dev.ps1</code> из папки проекта.</p>{serverError&&<div className="ji-feedback error" role="alert"><TriangleAlert size={17}/><p>{serverError}</p></div>}{receipt&&<div className="ji-server-receipt" role="status"><CheckCircle2 size={19}/><div><strong>{receipt.filename}</strong><p>Добавлено: {receipt.imported} · Повторов: {receipt.duplicates} · {date(receipt.imported_at)}</p><a href="/catalog/?source=uploaded">Открыть импортированные записи <ArrowUpRight size={15}/></a></div></div>}</section>}
    {active?<><div className="ji-summary"><div><span>Наблюдений</span><strong>{rows.length}</strong></div><div><span>С найденной ценой</span><strong>{priceCount}</strong></div><div><span>Требуют проверки</span><strong>{reviewCount}</strong></div><div><span>Ошибок обхода</span><strong>{active.data.errors.length}</strong></div></div><div className="ji-data-note"><Info size={17}/><p>Это наблюдения отдельных страниц. Неизвестные условия не заполняются догадками, похожие товары не объединяются. Один проход не подтверждает скидку или динамику цены.</p></div><div className="ji-list-toolbar"><label className="ji-search"><Search size={17}/><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Название, бренд, SKU или MPN" aria-label="Поиск в импортированных наблюдениях"/></label><label className="ji-check"><input type="checkbox" checked={reviewOnly} onChange={event=>setReviewOnly(event.target.checked)}/>Только требующие проверки</label><button className="ji-button subtle" onClick={download}><ArrowDownToLine size={15}/>Скачать JSON</button></div><p className="ji-list-count">Показано {filtered.length} из {rows.length} · {active.data.job.partial?'Неполный проход':'Завершённый проход'} · Выгрузка {date(active.data.job.exported_at)}</p><div className="ji-observations">{filtered.map(({row,index})=><Observation key={`${row.source.url}-${row.source.captured_at}-${index}`} row={row} index={index}/>)}</div>{!filtered.length&&<div className="ji-empty small"><Search size={28}/><h3>Наблюдения не найдены</h3><p>Измените поиск или отключите фильтр проверки.</p></div>}{active.data.errors.length>0&&<details className="ji-errors"><summary><TriangleAlert size={16}/>Ошибки обхода ({active.data.errors.length})<ChevronDown size={15}/></summary><pre>{JSON.stringify(active.data.errors,null,2)}</pre></details>}</>:<div className="ji-empty"><FileJson size={38}/><h3>Импортов пока нет</h3><p>Выберите JSON, скачанный расширением. После предпросмотра нажмите «Добавить в каталог сайта». Локальное сохранение используется только для просмотра.</p></div>}
  </div>;
}
