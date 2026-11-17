'use strict';
const $=id=>document.getElementById(id);
const parser=globalThis.CenoskopExtractor;
const defaults={delaySeconds:12,renderWaitSeconds:8,pageTimeoutSeconds:45,maxPages:50,categoryScrollRounds:12,categoryScrollPauseSeconds:2,categoryMaxProducts:100,categoryMaxPages:3,autoExport:true};
const settingLimits={delaySeconds:[5,300],renderWaitSeconds:[3,30],pageTimeoutSeconds:[15,90],maxPages:[1,200],categoryScrollRounds:[0,50],categoryScrollPauseSeconds:[1,10],categoryMaxProducts:[1,200],categoryMaxPages:[1,10]};
const statusLabels={idle:'Готов к старту',running:'Сбор идёт',paused:'На паузе',completed:'Сбор завершён',stopped:'Остановлено',blocked:'Доступ ограничен'};
const phaseLabels={idle:'Ожидаем запуска',opening:'Открываем страницу',loading:'Загружаем страницу',navigating:'Переходим к странице',waiting:'Ожидаем загрузку',rendering:'Ожидаем содержимое',render_wait:'Ожидаем содержимое',settling:'Ожидаем содержимое',discovering:'Прокручиваем и подгружаем товары',extracting:'Извлекаем данные',reading:'Читаем страницу',cooldown:'Пауза между страницами',delay:'Пауза между страницами',waiting_delay:'Пауза между страницами',paused:'Сбор на паузе',completed:'Все страницы обработаны',blocked:'Доступ ограничен',stopped:'Сбор остановлен'};
const queueLabels={queued:'В очереди',pending:'В очереди',running:'В работе',processing:'В работе',loading:'В работе',complete:'Готово',waiting:'Подготовка',done:'Готово',completed:'Готово',failed:'Ошибка',error:'Ошибка',skipped:'Пропущено',blocked:'Доступ ограничен'};
const reasonLabels={region_unconfirmed:'Регион неизвестен',payment_condition_unconfirmed:'Условия оплаты неизвестны',condition_unconfirmed:'Состояние неизвестно',seller_unavailable:'Продавец неизвестен',mpn_unavailable:'MPN неизвестен',availability_unconfirmed:'Наличие неизвестно',price_unresolved:'Цена не определена',matching_jsonld_offer_unavailable:'Нет совпавшего JSON-LD',ambiguous_matching_offers:'Несколько предложений',dom_price_requires_review:'DOM-цена требует проверки',condition_conflict:'Состояние противоречиво',missing_price:'Цена не определена',price_unavailable:'Цена не определена',ambiguous_price:'Несколько вариантов цены',multiple_prices:'Несколько вариантов цены',region_unknown:'Регион неизвестен',unknown_region:'Регион неизвестен',payment_condition_unknown:'Условия оплаты неизвестны',unknown_payment_condition:'Условия оплаты неизвестны',price_type_unknown:'Тип цены неизвестен',unknown_price_type:'Тип цены неизвестен',seller_unknown:'Продавец неизвестен',unknown_seller:'Продавец неизвестен',identity_unconfirmed:'Вариант не подтверждён',unknown_condition:'Состояние неизвестно',condition_unknown:'Состояние неизвестно'};
let currentState={version:1,status:'idle',queue:[],index:0,settings:defaults,results:[],errors:[]};
let busy=false,revision=0,refreshing=false,configDirty=false,configInitialized=false,legacyInputWarning=false;

async function message(type,extra={}){
  if(!globalThis.chrome?.runtime?.sendMessage)throw new Error('Откройте сборщик значком установленного расширения.');
  const response=await chrome.runtime.sendMessage({type,...extra});
  if(!response?.ok)throw new Error(response?.error||'Фоновый сборщик не ответил. Обновите расширение и откройте вкладку сборщика повторно.');
  return response.data;
}
function notify(text,kind=''){$('notification').textContent=text;$('notification').className=`notification ${kind}`;$('notification').hidden=!text;}
function clearJsonPreview(){$('jsonPanel').hidden=true;$('jsonText').value='';$('jsonState').textContent='';$('jsonCopyStatus').textContent='';$('showJsonButton').textContent='Показать JSON';}
function readUrls(){
  const values=$('sourceUrls').value.split(/\r?\n/).map(value=>value.trim()).filter(Boolean);
  if(!values.length)throw new Error('Добавьте хотя бы одну ссылку на карточку или категорию.');
  if(values.length>200)throw new Error('Допускается не более 200 исходных ссылок.');
  return [...new Set(values.map(value=>parser.supportedPage(value).url))];
}
function readSettings(){
  const settings={autoExport:$('autoExport').checked};
  for(const [key,[min,max]] of Object.entries(settingLimits)){const value=Number($(key).value);if(!Number.isInteger(value)||value<min||value>max)throw new Error(`Проверьте настройки: допустимый диапазон ${min}–${max}.`);settings[key]=value;}
  return settings;
}
function readPartition(){
  const count=Number($('partitionCount').value),index=Number($('partitionIndex').value);
  if(!Number.isInteger(count)||count<1||count>32||!Number.isInteger(index)||index<1||index>count)throw new Error('Номер экземпляра должен быть от 1 до общего количества экземпляров (не более 32).');
  return {count,index};
}
const configVersion='cenoskop.collector-config.v1';
function exactObject(value,keys,label){
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error(`${label}: ожидается объект.`);
  const missing=keys.filter(key=>!Object.hasOwn(value,key)),extra=Object.keys(value).filter(key=>!keys.includes(key));
  if(missing.length||extra.length)throw new Error(`${label}: ${missing.length?`не хватает ${missing.join(', ')}`:''}${missing.length&&extra.length?'; ':''}${extra.length?`неизвестные поля ${extra.join(', ')}`:''}.`);
  return value;
}
function parseConfig(raw){
  if(raw.length>500000)throw new Error('Конфигурация больше допустимых 500 000 символов.');
  let input;try{input=JSON.parse(raw);}catch{throw new Error('Некорректный JSON. Проверьте кавычки, запятые и скобки.');}
  const config=exactObject(input,['schema_version','urls','settings','partition'],'Конфигурация');
  if(config.schema_version!==configVersion)throw new Error(`schema_version: ожидается ${configVersion}.`);
  if(!Array.isArray(config.urls)||config.urls.length<1||config.urls.length>200||config.urls.some(url=>typeof url!=='string'||!url.trim()||url.length>2000))throw new Error('urls: нужен массив от 1 до 200 ссылок.');
  let urls;try{urls=[...new Set(config.urls.map(url=>parser.supportedPage(url.trim()).url))];}catch{throw new Error('urls: используйте ссылки на карточки Ozon/Wildberries или категории Ozon.');}
  const keys=[...Object.keys(settingLimits),'autoExport'];const source=exactObject(config.settings,keys,'settings');const settings={};
  for(const [key,[min,max]] of Object.entries(settingLimits)){
    const value=source[key];if(typeof value!=='number'||!Number.isInteger(value)||value<min||value>max)throw new Error(`settings.${key}: нужно целое число от ${min} до ${max}.`);
    settings[key]=value;
  }
  if(typeof source.autoExport!=='boolean')throw new Error('settings.autoExport: ожидается true или false.');settings.autoExport=source.autoExport;
  const part=exactObject(config.partition,['count','index'],'partition');
  if(!Number.isInteger(part.count)||part.count<1||part.count>32||!Number.isInteger(part.index)||part.index<1||part.index>part.count)throw new Error('partition: count — от 1 до 32, index — от 1 до count.');
  return {schema_version:configVersion,urls,settings,partition:{count:part.count,index:part.index}};
}
function formConfig(){return {schema_version:configVersion,urls:readUrls(),settings:readSettings(),partition:readPartition()};}
function configStatus(message,kind=''){$('configStatus').textContent=message;$('configStatus').className=`config-status ${kind}`;}
function generateConfig(){
  const config=formConfig();$('configJson').value=JSON.stringify(config,null,2);configDirty=false;configInitialized=true;return config;
}
function requiredOrigins(urls){
  const marketplaces=new Set(urls.map(value=>parser.supportedPage(value).marketplace));
  const origins=[];
  if(marketplaces.has('ozon'))origins.push('https://www.ozon.ru/*','https://ozon.ru/*');
  if(marketplaces.has('wildberries'))origins.push('https://www.wildberries.ru/*','https://wildberries.ru/*');
  return origins;
}
function updatePermissionSummary(){
  try{const origins=requiredOrigins(readUrls());const names=[];if(origins.some(value=>value.includes('ozon.ru')))names.push('Ozon');if(origins.some(value=>value.includes('wildberries.ru')))names.push('Wildberries');$('permissionSummary').textContent=`При старте потребуется доступ к ${names.join(' и ')}.`;}
  catch{$('permissionSummary').textContent='При старте потребуется доступ только к выбранным площадкам.';}
}
function updateSettingsSummary(){$('settingsSummary').textContent=`${$('delaySeconds').value||defaults.delaySeconds} сек · до ${$('maxPages').value||defaults.maxPages} страниц`;}
function controls(){
  const active=['running','paused'].includes(currentState.status);
  $('configApplyButton').disabled=busy||active;
  $('sourceFields').disabled=busy||active;
  $('startButton').disabled=busy||active;
  $('pauseButton').disabled=busy||currentState.status!=='running';
  $('resumeButton').disabled=busy||currentState.status!=='paused';
  $('stopButton').disabled=!busy&&!['running','paused','blocked'].includes(currentState.status);
  $('exportButton').disabled=busy||!((currentState.results||[]).length||(currentState.queue||[]).length||(currentState.errors||[]).length);
  $('showJsonButton').disabled=$('exportButton').disabled;
  $('clearButton').disabled=busy||active||!((currentState.results||[]).length||(currentState.queue||[]).length||(currentState.errors||[]).length);
  $('clearButton').title=active?'Сначала остановите сбор':'';
  $('replaceWarning').hidden=active||!(currentState.results||[]).length;
}
function timeText(value){const date=new Date(value);return Number.isNaN(date.valueOf())?'':date.toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit',second:'2-digit',timeZone:'Europe/Moscow'});}
function dateText(value){const date=new Date(value);return Number.isNaN(date.valueOf())?'':date.toLocaleString('ru-RU',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Moscow'});}
function element(tag,className,text){const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=String(text);return node;}
function renderQueue(queue){
  const list=$('queueList');list.replaceChildren();$('queueEmpty').hidden=queue.length>0;$('queueCount').textContent=String(queue.length);
  const stopLabels={round_limit:'лимит прокруток',product_limit:'лимит товаров',queue_limit:'общий лимит очереди',no_growth:'новых карточек больше нет',end:'конец категории'};
  queue.slice(0,200).forEach((item,index)=>{
    const row=element('li'),url=element('div','queue-url',item.url||'Адрес не указан');url.title=item.url||'';
    if(item.error)url.append(element('small','',typeof item.error==='string'?item.error:'Не удалось обработать страницу'));
    if(item.kind==='discovery'&&item.discovery){
      const d=item.discovery,count=Array.isArray(d.seen_urls)?d.seen_urls.length:Number(d.found_count)||0;
      url.append(element('small','category-summary',`Найдено ссылок на странице: ${count}${d.stop_reason?` · ${stopLabels[d.stop_reason]||'Чтение завершено'}`:''}`));
    }
    const label=item.kind==='discovery'&&item.status==='waiting'?'Подгрузка':queueLabels[item.status]||'Ожидает';
    row.append(element('span','queue-index',index+1),url,element('span',`queue-state ${item.status||''}`,label));list.append(row);
  });
}
function renderDiscovery(state,current){
  const discovery=current?.discovery,active=state.phase==='discovering'&&discovery;
  $('discoveryProgress').hidden=!active;
  if(active){
    const settings={...defaults,...state.settings};
    const seen=Array.isArray(discovery.seen_urls)?discovery.seen_urls.length:0;
    $('discoverySummary').textContent=`Страница ${discovery.page_number||1} из ${settings.categoryMaxPages} · Прокрутка ${discovery.scrolls||0} из ${settings.categoryScrollRounds} · Найдено ссылок на этой странице: ${seen}.`;
  }
  const discovered=Number(state.discovered_count)||0,truncated=Number(state.truncated_count)||0;
  $('discoveryTotals').hidden=!discovered&&!truncated;
  $('discoveryTotals').textContent=`Найдено товаров для этого экземпляра: ${discovered}.${truncated?` Не добавлено из-за лимитов: ${truncated}. Проверьте общий лимит очереди и лимит товаров категории для следующего запуска.`:''}`;
}
function field(list,label,value){const row=element('div');row.append(element('dt','',label),element('dd','',value==null||value===''?'Неизвестно':value));list.append(row);}
function renderResults(results){
  $('resultsSection').hidden=!results.length;const list=$('resultList');list.replaceChildren();
  for(const record of results.slice(-3).reverse()){
    const source=record.source||{},product=record.product||{},offer=record.offer||{},card=element('article','result-card');
    const top=element('div','result-top');top.append(element('span','result-marketplace',source.marketplace==='ozon'?'OZON':source.marketplace==='wildberries'?'WILDBERRIES':'ИСТОЧНИК'),element('span',`result-review ${record.needs_review?'':'neutral'}`,record.needs_review?'Требует проверки':'Поля извлечены'));card.append(top,element('h4','',product.title||'Название не определено'));
    const hasPrice=typeof offer.price==='number'&&Number.isFinite(offer.price);const price=hasPrice?`${new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2}).format(offer.price)} ${offer.currency==='RUB'?'₽':offer.currency||'(валюта неизвестна)'}`:'Цена не определена';card.append(element('p',`result-price ${hasPrice?'':'unknown'}`,price));
    const fields=element('dl','result-fields');field(fields,'Продавец',offer.seller?.name);field(fields,'Регион',offer.region);field(fields,'Тип цены',({regular:'Обычная',membership:'По карте / клубная',installment:'Рассрочка'})[offer.price_type]||null);field(fields,'Оплата',({any_card:'Любая карта',other_bank_card:'Другие банки',marketplace_card:'Карта площадки',wallet:'Кошелёк',installment:'Рассрочка'})[offer.payment_condition]||null);field(fields,'MPN',product.mpn);field(fields,'Наличие',offer.availability===true?'В наличии':offer.availability===false?'Недоступно':null);card.append(fields);
    const footer=element('div','result-source');let safeUrl=null;try{safeUrl=parser.supportedPage(source.url).url;}catch{/* Unknown URLs remain plain text. */}
    if(safeUrl){const anchor=element('a','',safeUrl);anchor.href=safeUrl;anchor.target='_blank';anchor.rel='noopener noreferrer';footer.append(anchor);}else footer.append(element('span','',source.url||'Источник не определён'));
    footer.append(element('span','',dateText(source.captured_at)));card.append(footer);
    if(record.needs_review){const reasons=(record.review_reasons||[]).slice(0,3).map(reason=>reasonLabels[reason]||String(reason)).join(' · ');card.append(element('p','result-reasons',reasons||'Точный вариант и условия требуют проверки перед использованием.'));}
    list.append(card);
  }
}
function renderState(state,hydrate=false){
  if(!state||typeof state!=='object')throw new Error('Сборщик вернул некорректное состояние.');
  currentState=state;const queue=Array.isArray(state.queue)?state.queue:[],results=Array.isArray(state.results)?state.results:[],errors=Array.isArray(state.errors)?state.errors:[];
  if(hydrate){const settings={...defaults,...state.settings};for(const key of Object.keys(settingLimits))$(key).value=String(settings[key]);$('autoExport').checked=settings.autoExport!==false;$('partitionCount').value=String(state.partition?.count||1);$('partitionIndex').value=String(state.partition?.index||1);if(Array.isArray(state.input_urls)&&state.input_urls.length)$('sourceUrls').value=state.input_urls.join('\n');else if(queue.length){legacyInputWarning=true;$('sourceUrls').value=queue.map(item=>item.url).filter(Boolean).join('\n');configStatus('Ссылки восстановлены из старой очереди. Проверьте их: они могут отличаться от исходных.','error');}updateSettingsSummary();updatePermissionSummary();if(!configInitialized&&!configDirty){try{generateConfig();}catch{/* The editor remains available for a pasted configuration. */}}}
  $('statusLabel').textContent=statusLabels[state.status]||'Состояние неизвестно';$('statusBadge').className=`status-badge ${Object.hasOwn(statusLabels,state.status)?state.status:'idle'}`;
  $('collectedCount').textContent=String(results.length);$('reviewCount').textContent=String(results.filter(result=>result.needs_review===true).length);$('errorCount').textContent=String(errors.length);$('exportCount').textContent=String(results.length);
  const finished=queue.filter(item=>['complete','done','completed','failed','error','skipped','blocked'].includes(item.status)).length;const percentage=queue.length?Math.round(finished/queue.length*100):0;$('queueProgress').textContent=`${finished} из ${queue.length} страниц`;$('progressFill').style.width=`${percentage}%`;$('progressBar').setAttribute('aria-valuenow',String(percentage));
  const current=queue[Number.isInteger(state.index)?state.index:0];$('currentTask').hidden=!queue.length;$('phaseLabel').textContent=phaseLabels[state.phase]||statusLabels[state.status]||'Ожидание';$('currentUrl').textContent=current?.url||(['completed','stopped'].includes(state.status)?'Очередь остановлена; результаты сохранены в браузере.':'');$('currentUrl').title=current?.url||'';
  const next=state.next_action_at?new Date(state.next_action_at):null;$('nextAction').textContent=next&&!Number.isNaN(next.valueOf())?(next.valueOf()>Date.now()?`Не раньше ${timeText(state.next_action_at)}`:'Ожидаем таймер браузера'):'';
  $('blockedNotice').hidden=state.status!=='blocked';
  const exported=state.last_export;$('exportNotice').hidden=!exported;if(exported){$('exportNotice').className=`export-notice ${exported.error?'error':''}`;$('exportNotice').textContent=exported.error?`Не удалось автоматически скачать JSON: ${String(exported.error)}. Используйте кнопку «Скачать JSON».`:`JSON сохранён: ${exported.filename||'файл загрузки'}${exported.exported_at?` · ${dateText(exported.exported_at)}`:''}`;}
  renderDiscovery(state,current);renderQueue(queue);renderResults(results);controls();
}
async function command(type,success,extra={}){
  const requestRevision=++revision;busy=true;controls();
  try{const state=await message(type,extra);if(requestRevision!==revision)return;if(type==='AUTO_CLEAR')clearJsonPreview();renderState(state);if(success)notify(success);}
  catch(error){if(requestRevision===revision)notify(error instanceof Error?error.message:'Не удалось выполнить действие.','error');}
  finally{if(requestRevision===revision){busy=false;controls();}}
}
$('collectorForm').addEventListener('submit',event=>{
  event.preventDefault();let urls,settings,partition,permission,requestRevision;
  try{
    if(configDirty){configStatus('Сначала примените JSON или сформируйте его из настроек.','error');throw new Error('Сначала примените JSON или сформируйте его из настроек.');}
    urls=readUrls();settings=readSettings();partition=readPartition();
    if((currentState.results||[]).length&&!window.confirm('Новый сбор заменит текущую очередь и локальные результаты. Если они нужны, сначала скачайте или скопируйте JSON. Начать новый сбор?'))return;
    requestRevision=++revision;
    permission=chrome.permissions.request({origins:requiredOrigins(urls)});
  }catch(error){notify(error instanceof Error?error.message:'Проверьте ссылки и настройки.','error');return;}
  busy=true;controls();notify('Ожидаем разрешение браузера на выбранные площадки…');
  (async()=>{try{if(!await permission)throw new Error('Доступ к выбранным площадкам не выдан. Сбор не запущен.');if(requestRevision!==revision)return;const state=await message('AUTO_START',{urls,settings,partition});if(requestRevision!==revision)return;clearJsonPreview();renderState(state);notify('Сбор запущен. Эту вкладку можно закрыть; браузер оставьте открытым.');}catch(error){if(requestRevision===revision)notify(error instanceof Error?error.message:'Не удалось запустить сбор.','error');}finally{if(requestRevision===revision){busy=false;controls();}}})();
});
$('pauseButton').addEventListener('click',()=>void command('AUTO_PAUSE','Сбор на паузе. Собранные наблюдения сохранены.'));
$('resumeButton').addEventListener('click',()=>void command('AUTO_RESUME','Продолжаем сохранённую очередь.'));
$('stopButton').addEventListener('click',()=>void command('AUTO_STOP','Сбор остановлен. Скачайте уже полученные наблюдения в JSON.'));
$('clearButton').addEventListener('click',()=>{if(!window.confirm('Очистить локальную очередь, результаты и ошибки? Сначала скачайте или скопируйте JSON, если данные нужны.'))return;void command('AUTO_CLEAR','Локальная очередь и результаты очищены.');});
$('exportButton').addEventListener('click',()=>{
  const requestRevision=++revision;busy=true;controls();
  (async()=>{try{const result=await message('AUTO_EXPORT',{saveAs:true});if(requestRevision!==revision)return;if(result.state_snapshot)renderState({...currentState,...result.state_snapshot});notify(`JSON передан в загрузки: ${result.filename||'файл наблюдений'} · ${result.observation_count??(currentState.results||[]).length} записей.`);}catch(error){if(requestRevision===revision)notify(error instanceof Error?error.message:'Не удалось скачать JSON.','error');}finally{if(requestRevision===revision){busy=false;controls();}}})();
});
$('showJsonButton').addEventListener('click',()=>{
  const requestRevision=++revision;busy=true;controls();
  (async()=>{try{
    const result=await message('AUTO_GET_EXPORT_JSON');if(requestRevision!==revision)return;
    if(typeof result?.json!=='string'||!result.json)throw new Error('Сборщик не вернул JSON.');
    $('jsonText').value=result.json;$('jsonPanel').hidden=false;$('showJsonButton').textContent='Обновить JSON';
    $('jsonState').textContent=`${result.partial?'Промежуточные данные':'Сбор завершён'} · наблюдений: ${result.observation_count??(currentState.results||[]).length}.`;
    $('jsonCopyStatus').textContent='';
  }catch(error){if(requestRevision===revision)notify(error instanceof Error?error.message:'Не удалось показать JSON.','error');}
  finally{if(requestRevision===revision){busy=false;controls();}}})();
});
$('copyJsonButton').addEventListener('click',()=>{
  const data=$('jsonText').value;if(!data)return;
  (async()=>{try{
    if(!navigator.clipboard?.writeText)throw new Error('Clipboard unavailable');
    await navigator.clipboard.writeText(data);$('jsonCopyStatus').textContent='JSON скопирован. Вставьте его в сообщение.';
  }catch{$('jsonText').focus();$('jsonText').select();$('jsonCopyStatus').textContent='Не удалось скопировать автоматически. Текст выделен — нажмите Ctrl+C, затем вставьте в сообщение.';}})();
});
$('configJson').addEventListener('input',()=>{configDirty=true;});
$('configGenerateButton').addEventListener('click',()=>{
  try{generateConfig();configStatus(legacyInputWarning?'Ссылки восстановлены из старой очереди. Проверьте их: они могут отличаться от исходных.':'Конфигурация сформирована из текущих настроек.',legacyInputWarning?'error':'');}
  catch(error){configStatus(error instanceof Error?error.message:'Проверьте настройки.','error');}
});
$('configApplyButton').addEventListener('click',()=>{
  try{
    if(busy||['running','paused'].includes(currentState.status))throw new Error('Чтобы применить новую конфигурацию, сначала остановите текущий сбор.');
    const config=parseConfig($('configJson').value);
    $('sourceUrls').value=config.urls.join('\n');legacyInputWarning=false;
    for(const key of Object.keys(settingLimits))$(key).value=String(config.settings[key]);
    $('autoExport').checked=config.settings.autoExport;$('partitionCount').value=String(config.partition.count);$('partitionIndex').value=String(config.partition.index);configDirty=false;configInitialized=true;
    updateSettingsSummary();updatePermissionSummary();configStatus('Конфигурация применена. Для запуска нажмите «Начать сбор».');
  }catch(error){configStatus(error instanceof Error?error.message:'Не удалось применить конфигурацию.','error');}
});
$('configCopyButton').addEventListener('click',()=>{
  const data=$('configJson').value;if(!data){configStatus('Сначала сформируйте или вставьте конфигурацию.','error');return;}
  (async()=>{try{
    if(!navigator.clipboard?.writeText)throw new Error('Clipboard unavailable');
    await navigator.clipboard.writeText(data);configStatus('Конфигурация скопирована. Вставьте её в сообщение.');
  }catch{$('configJson').focus();$('configJson').select();configStatus('Текст выделен — нажмите Ctrl+C, затем вставьте в сообщение.','error');}})();
});
$('addCategory').addEventListener('click',()=>{const category='https://www.ozon.ru/category/videokarty-15721/';const existing=$('sourceUrls').value.trim();if(!existing.split(/\r?\n/).includes(category))$('sourceUrls').value=existing?`${existing}\n${category}`:category;updatePermissionSummary();});
$('sourceUrls').addEventListener('input',()=>{legacyInputWarning=false;updatePermissionSummary();});
for(const key of ['delaySeconds','maxPages'])$(key).addEventListener('input',updateSettingsSummary);
async function refresh(hydrate=false){
  if(refreshing||busy)return;refreshing=true;const requestRevision=revision;
  try{const state=await message('AUTO_GET_STATE');if(requestRevision===revision&&!busy)renderState(state,hydrate);}
  catch(error){if(requestRevision===revision&&!busy)notify(error instanceof Error?error.message:'Не удалось прочитать прогресс.','error');}
  finally{refreshing=false;}
}
updatePermissionSummary();updateSettingsSummary();controls();void refresh(true);
const refreshInterval=window.setInterval(()=>void refresh(),1000);
window.addEventListener('unload',()=>window.clearInterval(refreshInterval));
