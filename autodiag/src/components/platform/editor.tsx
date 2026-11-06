"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ReactFlow, Background, Controls, type Connection, type Node, type Edge, type NodeChange, type EdgeChange } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { Algorithm, AlgorithmEdge, AlgorithmNode, EdgeCondition, NodeType } from "@/platform/models";
import { checks, dtcs, symptoms } from "@/platform/seed";
import { useWorkspace } from "@/platform/store";
import { validateGraph } from "@/platform/graph";
import styles from "./editor.module.css";

const names: Record<NodeType, string> = { information: "Информация", action: "Действие", measurement: "Измерение", condition: "Условие", conclusion: "Заключение" };
const makeId = (prefix: string) => `${prefix}-${typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`}`;
const lines = (value: string) => value.split('\n');
const emptyVehicle = { make: "", model: "", generation: "", engine: "", transmission: "" };

/** Graph authoring only: no patient/car result, fact, or session is written here. */
export function AlgorithmEditor({ algorithmId }: { algorithmId?: string }) {
  const { ready, user, algorithms, storageError, createAlgorithm, saveAlgorithm, publishAlgorithm } = useWorkspace();
  const [item, setItem] = useState<Algorithm | null>(null);
  const [selectedNode, setSelectedNode] = useState("");
  const [selectedEdge, setSelectedEdge] = useState("");
  const [targetNode, setTargetNode] = useState("");
  const [notice, setNotice] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [preview, setPreview] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [vehicle, setVehicle] = useState({ ...emptyVehicle });

  useEffect(() => {
    if (!ready) return;
    const id = algorithmId || new URLSearchParams(window.location.search).get("id");
    if (!id) return;
    const found = algorithms.find(a => a.id === id);
    if (found && found.status === "draft" && user && found.authorId === user.id) {
      setItem(structuredClone(found)); setSelectedNode(found.graph.startNodeId); setNotice("");
    } else if (found) setNotice("Редактировать можно только свой черновик. Чтобы изменить опубликованный алгоритм, сначала скопируйте его к себе.");
    else setNotice("Черновик не найден в этом браузере.");
  // Re-open only when the route or account changes; typing must not be overwritten by store refreshes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, algorithmId, user?.id]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const node = item?.graph.nodes.find(n => n.id === selectedNode);
  const edge = item?.graph.edges.find(e => e.id === selectedEdge);
  const nodes: Node[] = useMemo(() => (item?.graph.nodes ?? []).map(n => ({
    id: n.id, position: n.position, data: { label: `${n.id === item?.graph.startNodeId ? "● СТАРТ · " : ""}${names[n.type]}\n${n.title || "Без названия"}` },
    className: n.id === selectedNode ? "diagdoc-flow-node selected-node" : "diagdoc-flow-node",
  })), [item, selectedNode]);
  const edges: Edge[] = useMemo(() => (item?.graph.edges ?? []).map(e => ({ id: e.id, source: e.source, target: e.target, label: e.condition?.label || undefined, selected: e.id === selectedEdge, animated: false })), [item, selectedEdge]);

  function update(updateFn: (a: Algorithm) => Algorithm) { setItem(old => old ? updateFn(old) : old); setDirty(true); setErrors([]); setNotice(""); }
  function updateNode(change: Partial<AlgorithmNode>) { if (!selectedNode) return; update(a => ({ ...a, graph: { ...a.graph, nodes: a.graph.nodes.map(n => n.id === selectedNode ? { ...n, ...change } : n) } })); }
  function updateEdge(change: Partial<AlgorithmEdge>) { if (!selectedEdge) return; update(a => ({ ...a, graph: { ...a.graph, edges: a.graph.edges.map(e => e.id === selectedEdge ? { ...e, ...change } : e) } })); }
  function changeCondition(change: Partial<EdgeCondition>) {
    if (!edge) return;
    updateEdge({ condition: { kind: edge.condition?.kind ?? "outcome", label: edge.condition?.label ?? "", ...edge.condition, ...change } });
  }
  function start() {
    if (dirty && !window.confirm("Несохранённые изменения текущего черновика будут потеряны. Создать новый алгоритм?")) return;
    const created = createAlgorithm();
    if (!created) { setNotice(storageError || "Не удалось создать черновик. Проверьте доступность локального хранилища."); return; }
    setVehicle({ ...emptyVehicle }); setItem(structuredClone(created)); setSelectedNode(created.graph.startNodeId); setSelectedEdge(""); setNotice("Создан локальный черновик. Изменения сохраняются только в этом браузере."); setDirty(false);
    window.history.replaceState(null, "", `?id=${encodeURIComponent(created.id)}`);
  }
  function addVehicle() {
    const make = vehicle.make.trim();
    if (!make) { setNotice("Укажите производителя или добавьте вариант «Универсально»."); return; }
    const value = `${make} → ${vehicle.model.trim() || "модель не добавлена"} → поколение: ${vehicle.generation.trim() || "не добавлено"} → двигатель: ${vehicle.engine.trim() || "не добавлено"} → коробка: ${vehicle.transmission.trim() || "не добавлено"}`;
    update(a => {
      const current = a.applicability.map(v => v.trim()).filter(Boolean);
      const specific = current.length === 1 && current[0].toLocaleLowerCase("ru") === "универсально" ? [] : current;
      return { ...a, applicability: specific.includes(value) ? specific : [...specific, value] };
    });
    setVehicle({ ...emptyVehicle });
  }
  function addUniversal() {
    update(a => {
      const current = a.applicability.map(v => v.trim()).filter(Boolean);
      return { ...a, applicability: current.some(v => v.toLocaleLowerCase("ru") === "универсально") ? current : [...current, "Универсально"] };
    });
  }
  function addNode(type: NodeType) {
    const id = makeId("node");
    const count = item?.graph.nodes.length ?? 0;
    const next: AlgorithmNode = { id, type, title: names[type], text: "", position: { x: 60 + (count % 3) * 230, y: 50 + Math.floor(count / 3) * 150 } };
    update(a => ({ ...a, graph: { ...a.graph, startNodeId: a.graph.startNodeId || id, nodes: [...a.graph.nodes, next] } }));
    setSelectedNode(id); setSelectedEdge("");
  }
  function removeNode(id: string) {
    update(a => ({ ...a, graph: { ...a.graph, startNodeId: a.graph.startNodeId === id ? "" : a.graph.startNodeId, nodes: a.graph.nodes.filter(n => n.id !== id), edges: a.graph.edges.filter(e => e.source !== id && e.target !== id) } }));
    setSelectedNode(""); setSelectedEdge("");
  }
  function connect(source: string, target: string) {
    if (!item || !source || !target || source === target) { setNotice("Выберите разные исходный и конечный шаги."); return; }
    if (item.graph.edges.some(e => e.source === source && e.target === target)) { setNotice("Такой переход уже существует."); return; }
    const sourceType = item.graph.nodes.find(n => n.id === source)?.type;
    if (sourceType === "conclusion") { setNotice("Заключение — конечный шаг, у него нет исходящих переходов."); return; }
    const next: AlgorithmEdge = { id: makeId("edge"), source, target, ...(sourceType === "condition" ? { condition: { kind: "outcome", label: "" } as EdgeCondition } : {}) };
    update(a => ({ ...a, graph: { ...a.graph, edges: [...a.graph.edges, next] } }));
    setSelectedEdge(next.id); setSelectedNode(""); setTargetNode("");
  }
  function onNodeChanges(changes: NodeChange[]) {
    const moves: { id: string; position: { x: number; y: number } }[] = [];
    const removed: string[] = [];
    for (const change of changes) { if (change.type === "position" && change.position) moves.push({ id: change.id, position: change.position }); if (change.type === "remove") removed.push(change.id); }
    if (!moves.length && !removed.length) return;
    update(a => ({ ...a, graph: { ...a.graph, startNodeId: removed.includes(a.graph.startNodeId) ? "" : a.graph.startNodeId, nodes: a.graph.nodes.filter(n => !removed.includes(n.id)).map(n => { const m = moves.find(x => x.id === n.id); return m ? { ...n, position: m.position } : n; }), edges: a.graph.edges.filter(e => !removed.includes(e.source) && !removed.includes(e.target)) } }));
    if (removed.includes(selectedNode)) setSelectedNode("");
  }
  function onEdgeChanges(changes: EdgeChange[]) { const removed=changes.filter(c => c.type === "remove").map(c => c.id); if (!removed.length) return; update(a => ({ ...a, graph: { ...a.graph, edges: a.graph.edges.filter(e => !removed.includes(e.id)) } })); if (removed.includes(selectedEdge)) setSelectedEdge(""); }
  function save(): boolean {
    if (!item) return false;
    const normalize = (values: string[]) => values.map(value => value.trim()).filter(Boolean);
    const result = saveAlgorithm({ ...item, applicability: normalize(item.applicability), tools: normalize(item.tools), entryConditions: normalize(item.entryConditions) });
    if (!result.ok) { setErrors(result.errors?.length ? result.errors : ["Не удалось сохранить черновик."]); return false; }
    setDirty(false); setNotice("Черновик сохранён в этом браузере."); return true;
  }
  function publish() {
    if (!item) return;
    const problems = [...(!item.title.trim() ? ["Добавьте название алгоритма."] : []), ...validateGraph(item.graph)];
    if (problems.length) { setErrors(problems); setNotice("Проверьте граф перед публикацией."); return; }
    if (!save()) return;
    const result = publishAlgorithm(item.id);
    if (!result.ok) { setErrors(result.errors?.length ? result.errors : ["Не удалось опубликовать алгоритм."]); return; }
    setItem(null); setSelectedNode(""); setDirty(false); setNotice("Алгоритм опубликован в этом браузере. Он доступен в локальном каталоге.");
    window.history.replaceState(null, "", window.location.pathname);
  }
  const orderedNodes = useMemo(() => {
    if (!item) return [];
    const result: AlgorithmNode[] = []; const seen = new Set<string>(); const queue = [item.graph.startNodeId];
    while (queue.length) { const id = queue.shift()!; if (seen.has(id)) continue; seen.add(id); const current = item.graph.nodes.find(n => n.id === id); if (!current) continue; result.push(current); item.graph.edges.filter(e => e.source === id).forEach(e => queue.push(e.target)); }
    return [...result, ...item.graph.nodes.filter(n => !seen.has(n.id))];
  }, [item]);
  if (!ready) return <div className={styles.loading}>Загружаем рабочее пространство…</div>;
  if (!user) return <div className={styles.empty}><h2>Редактор алгоритмов</h2><p>Чтобы создавать и публиковать алгоритмы, войдите в демонстрационный аккаунт. Данные хранятся только в этом браузере.</p><Link href="/settings/" className={styles.primary}>Войти в демо-режим</Link></div>;
  return <div className={styles.editor}>
    <div className={styles.top}><div><span className={styles.eyebrow}>РАБОЧЕЕ ПРОСТРАНСТВО / ДЕМО</span><h1>Редактор алгоритмов</h1><p>Собирайте шаблон проверки из шагов и переходов. Это не диагностическая сессия.</p></div><div className={styles.topActions}><button type="button" onClick={start}>Новый алгоритм</button>{item && <><button type="button" onClick={() => setPreview(!preview)}>{preview ? "Закрыть предпросмотр" : "Предпросмотр шагов"}</button><button type="button" onClick={save}>Сохранить</button><button type="button" className={styles.primary} onClick={publish}>Опубликовать</button></>}</div></div>
    {notice && <p className={styles.notice} role="status">{notice}</p>}
    {errors.length > 0 && <div className={styles.errors} role="alert"><strong>Не удалось опубликовать</strong><ul>{errors.map(e => <li key={e}>{e}</li>)}</ul></div>}
    {!item ? <div className={styles.empty}><h2>Создайте алгоритм</h2><p>Начните с пустого черновика или откройте свою копию из каталога. Публикации и черновики доступны только в текущем браузере.</p><button type="button" onClick={start} className={styles.primary}>Создать черновик</button><Link href="/algorithms/" className={styles.textLink}>Открыть каталог →</Link></div> : <>
      <div className={styles.metadata}><label>Название алгоритма<input value={item.title} onChange={e=>update(a=>({...a,title:e.target.value}))} maxLength={160}/></label><label>Система<select value={item.system} onChange={e=>update(a=>({...a,system:e.target.value}))}><option>Двигатель</option><option>Коробка передач</option><option>ABS / ESP</option><option>Кузовная электроника</option><option>Сеть и связь</option><option>Электропитание</option><option>Другое</option>{!["Двигатель", "Коробка передач", "ABS / ESP", "Кузовная электроника", "Сеть и связь", "Электропитание", "Другое"].includes(item.system) && <option>{item.system}</option>}</select></label><label className={styles.wide}>Краткое описание<textarea value={item.summary} onChange={e=>update(a=>({...a,summary:e.target.value}))} rows={2}/></label><label>Список применимости, по одной на строку<textarea value={item.applicability.join('\n')} onChange={e=>update(a=>({...a,applicability:lines(e.target.value)}))} rows={2}/></label><label>Инструменты, по одному на строку<textarea value={item.tools.join('\n')} onChange={e=>update(a=>({...a,tools:lines(e.target.value)}))} rows={2}/></label><label className={styles.wide}>Входные условия, по одному на строку<textarea value={item.entryConditions.join('\n')} onChange={e=>update(a=>({...a,entryConditions:lines(e.target.value)}))} rows={2}/></label>
        <fieldset className={styles.wide} style={{border:"1px solid #e1e8e5", borderRadius:8, padding:15, minWidth:0}}>
          <legend style={{fontWeight:800, fontSize:12, padding:"0 6px"}}>Автомобиль в применимости</legend>
          <p className={styles.hint} style={{margin:"0 0 12px"}}>Необязательный ручной ввод: производитель → модель → поколение → двигатель → коробка. Пустые поля будут помечены «не добавлено». Нормы и спецификации не подставляются.</p>
          <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))", gap:12}}>
            <label>Производитель<input value={vehicle.make} onChange={e=>setVehicle(v=>({...v,make:e.target.value}))} placeholder="Не добавлен" maxLength={80}/></label>
            <label>Модель<input value={vehicle.model} onChange={e=>setVehicle(v=>({...v,model:e.target.value}))} placeholder="Не добавлена" maxLength={80}/></label>
            <label>Поколение<input value={vehicle.generation} onChange={e=>setVehicle(v=>({...v,generation:e.target.value}))} placeholder="Не добавлено" maxLength={80}/></label>
            <label>Двигатель<input value={vehicle.engine} onChange={e=>setVehicle(v=>({...v,engine:e.target.value}))} placeholder="Не добавлен" maxLength={80}/></label>
            <label>Коробка<input value={vehicle.transmission} onChange={e=>setVehicle(v=>({...v,transmission:e.target.value}))} placeholder="Не добавлена" maxLength={80}/></label>
          </div>
          <div className={styles.toolbar} style={{marginBottom:0}}><button type="button" onClick={addVehicle}>Добавить автомобиль</button><button type="button" onClick={addUniversal}>Добавить «Универсально»</button></div>
        </fieldset>
        <details className={styles.wide} style={{border:"1px solid #e1e8e5", borderRadius:8, padding:"12px 15px", background:"#fff"}}>
          <summary style={{cursor:"pointer", color:"#536473", fontSize:12, fontWeight:800}}>Связанные коды и симптомы · {item.dtcIds.length} кодов, {item.symptomIds.length} симптомов</summary>
          <p className={styles.hint}>Выберите существующие материалы, для которых алгоритм может быть полезен. Связь не означает подтверждённую причину неисправности.</p>
          <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))", gap:16}}>
            <fieldset style={{border:0, padding:0, margin:0, minWidth:0}}><legend style={{color:"#536473", fontSize:11, fontWeight:800, marginBottom:8}}>Коды ошибок</legend><div style={{display:"grid", gap:8}}>{dtcs.map(dtc=><label key={dtc.id} style={{display:"flex", flexDirection:"row", alignItems:"flex-start", gap:9, fontWeight:500, fontSize:12}}><input type="checkbox" checked={item.dtcIds.includes(dtc.id)} onChange={e=>{const checked=e.target.checked; update(a=>({...a,dtcIds:checked ? [...new Set([...a.dtcIds,dtc.id])] : a.dtcIds.filter(id=>id!==dtc.id)}));}} style={{width:"auto", flex:"0 0 auto", marginTop:2}}/><span>{dtc.code} — {dtc.title}</span></label>)}</div></fieldset>
            <fieldset style={{border:0, padding:0, margin:0, minWidth:0}}><legend style={{color:"#536473", fontSize:11, fontWeight:800, marginBottom:8}}>Симптомы</legend><div style={{display:"grid", gap:8}}>{symptoms.map(symptom=><label key={symptom.id} style={{display:"flex", flexDirection:"row", alignItems:"flex-start", gap:9, fontWeight:500, fontSize:12}}><input type="checkbox" checked={item.symptomIds.includes(symptom.id)} onChange={e=>{const checked=e.target.checked; update(a=>({...a,symptomIds:checked ? [...new Set([...a.symptomIds,symptom.id])] : a.symptomIds.filter(id=>id!==symptom.id)}));}} style={{width:"auto", flex:"0 0 auto", marginTop:2}}/><span>{symptom.title}</span></label>)}</div></fieldset>
          </div>
        </details></div>
      <div className={styles.sectionTitle}><div><h2>Граф алгоритма</h2><p>Добавьте шаги и соедините их мышью или через форму. Ветви условия подпишите.</p></div><span>ЧЕРНОВИК · {dirty ? "есть несохранённые изменения" : "сохранено локально"}</span></div>
      <div className={styles.toolbar} aria-label="Добавить шаг">{(Object.keys(names) as NodeType[]).map(type=><button key={type} type="button" onClick={()=>addNode(type)}>+ {names[type]}</button>)}</div>
      <div className={styles.grid}><div><div className={styles.flow} aria-label="Граф шагов алгоритма"><ReactFlow nodes={nodes} edges={edges} onNodesChange={onNodeChanges} onEdgesChange={onEdgeChanges} onConnect={(c:Connection)=>{ if (c.source && c.target) connect(c.source,c.target); }} onNodeClick={(_,n)=>{setSelectedNode(n.id);setSelectedEdge("");}} onEdgeClick={(_,e)=>{setSelectedEdge(e.id);setSelectedNode("");}} fitView minZoom={0.2} maxZoom={2} deleteKeyCode={["Backspace","Delete"]} nodesConnectable nodesDraggable elementsSelectable><Background gap={20} size={1}/><Controls showInteractive={false}/></ReactFlow></div><p className={styles.hint}>Выберите шаг или переход на схеме. Можно также выбрать их в списке справа; удаление шага удалит связанные переходы.</p></div>
      <aside className={styles.panel}><label>Выбрать шаг<select value={selectedNode} onChange={e=>{setSelectedNode(e.target.value);setSelectedEdge("");}}><option value="">Выберите шаг</option>{item.graph.nodes.map(n=><option key={n.id} value={n.id}>{n.title || "Без названия"} · {names[n.type]}</option>)}</select></label><label>Выбрать переход<select value={selectedEdge} onChange={e=>{setSelectedEdge(e.target.value);setSelectedNode("");}}><option value="">Выберите переход</option>{item.graph.edges.map(e=><option key={e.id} value={e.id}>{item.graph.nodes.find(n=>n.id===e.source)?.title || "Шаг"} → {item.graph.nodes.find(n=>n.id===e.target)?.title || "Шаг"}{e.condition?.label ? ` · ${e.condition.label}` : ""}</option>)}</select></label>
      {node && <div className={styles.properties}><div className={styles.propertyHead}><strong>Шаг</strong><button type="button" className={styles.danger} onClick={()=>removeNode(node.id)}>Удалить</button></div><label>Тип шага<select value={node.type} onChange={e=>updateNode({type:e.target.value as NodeType})}>{(Object.keys(names) as NodeType[]).map(t=><option key={t} value={t}>{names[t]}</option>)}</select></label><label>Заголовок<input value={node.title} onChange={e=>updateNode({title:e.target.value})} maxLength={140}/></label><label>Описание<textarea value={node.text} onChange={e=>updateNode({text:e.target.value})} rows={4}/></label><label>Связанная проверка<select value={node.checkId || ""} onChange={e=>updateNode({checkId:e.target.value || undefined})}><option value="">Не выбрана</option>{checks.map(c=><option key={c.id} value={c.id}>{c.title}</option>)}</select></label><button type="button" onClick={()=>update(a=>({...a,graph:{...a.graph,startNodeId:node.id}}))} disabled={item.graph.startNodeId===node.id}>{item.graph.startNodeId===node.id ? "Стартовый шаг" : "Сделать стартовым"}</button><div className={styles.separator}/><label>Добавить переход к шагу<select value={targetNode} onChange={e=>setTargetNode(e.target.value)}><option value="">Выберите шаг</option>{item.graph.nodes.filter(n=>n.id!==node.id).map(n=><option key={n.id} value={n.id}>{n.title || "Без названия"}</option>)}</select></label><button type="button" onClick={()=>connect(node.id,targetNode)}>Соединить шаги</button></div>}
      {edge && <div className={styles.properties}><div className={styles.propertyHead}><strong>Переход</strong><button type="button" className={styles.danger} onClick={()=>{update(a=>({...a,graph:{...a.graph,edges:a.graph.edges.filter(e=>e.id!==edge.id)}}));setSelectedEdge("");}}>Удалить</button></div><p>{item.graph.nodes.find(n=>n.id===edge.source)?.title} → {item.graph.nodes.find(n=>n.id===edge.target)?.title}</p><label>Тип условия<select value={edge.condition?.kind || "none"} onChange={e=>{const kind=e.target.value; if(kind==="none")updateEdge({condition:undefined}); else updateEdge({condition:{kind:kind as EdgeCondition['kind'],label:edge.condition?.label || ""}});}}><option value="none">Без условия</option><option value="outcome">Исход (да / нет / неизвестно)</option><option value="choice">Выбор из списка</option><option value="comparison">Сравнение</option></select></label>{edge.condition && <><label>Подпись ветки<input value={edge.condition.label} onChange={e=>changeCondition({label:e.target.value})} placeholder="Например, неизвестно"/></label>{edge.condition.kind==="comparison" && <><label>Оператор<select value={edge.condition.operator || ""} onChange={e=>changeCondition({operator:(e.target.value || undefined) as EdgeCondition['operator']})}><option value="">Выберите оператор</option><option value="greater">Больше</option><option value="less">Меньше</option></select></label><label>Порог<input type="number" value={edge.condition.value ?? ""} onChange={e=>changeCondition({value:e.target.value})}/></label></>}</>}<p className={styles.hint}>Условия описывают ветви шаблона. Автоматическое сравнение измерений пока не выполняется.</p></div>}
      {!node && !edge && <p className={styles.hint}>Выберите шаг или переход, чтобы изменить его свойства.</p>}</aside></div>
      {preview && <section className={styles.preview}><h2>Предпросмотр шагов</h2><p>Это список шаблона, а не прохождение диагностики. Результаты проверок не сохраняются.</p><ol>{orderedNodes.map(n=><li key={n.id}><strong>{names[n.type]} · {n.title || "Без названия"}</strong>{n.id===item.graph.startNodeId && <span className={styles.tag}> Старт</span>}{n.text && <p>{n.text}</p>}{item.graph.edges.filter(e=>e.source===n.id).map(e=><small key={e.id}>{e.condition?.label || "Далее"} → {item.graph.nodes.find(x=>x.id===e.target)?.title || "Шаг не найден"}</small>)}</li>)}</ol></section>}
    </>}
  </div>;
}
export default AlgorithmEditor;





