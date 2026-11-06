import type { AlgorithmGraph } from './models';

/** Validates the editorial graph only. Positions and diagnostic outcomes are never executed. */
export function validateGraph(graph: AlgorithmGraph): string[] {
  const errors: string[] = [];
  if (!graph || graph.schemaVersion !== 1 || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) return ['Неподдерживаемый формат графа.'];
  if (!graph.nodes.length) return ['Добавьте хотя бы один шаг.'];
  const ids = new Set(graph.nodes.map(n => n.id));
  if (ids.size !== graph.nodes.length) errors.push('Идентификаторы шагов должны быть уникальны.');
  if (!graph.startNodeId || !ids.has(graph.startNodeId)) errors.push('Выберите существующий стартовый шаг.');
  if (new Set(graph.edges.map(e => e.id)).size !== graph.edges.length) errors.push('Идентификаторы переходов должны быть уникальны.');
  const outgoing = new Map(graph.nodes.map(n => [n.id, [] as typeof graph.edges]));
  const incoming = new Map(graph.nodes.map(n => [n.id, [] as typeof graph.edges]));
  for (const e of graph.edges) {
    if (!ids.has(e.source) || !ids.has(e.target)) { errors.push('Есть переход с отсутствующим шагом.'); continue; }
    if (e.source === e.target) errors.push('Переход на тот же шаг недопустим.');
    outgoing.get(e.source)!.push(e); incoming.get(e.target)!.push(e);
    if (e.condition?.kind === 'comparison' && (!e.condition.operator || e.condition.value === undefined || String(e.condition.value).trim() === '' || !Number.isFinite(Number(e.condition.value)))) errors.push('Для сравнения укажите оператор и числовой порог.');
  }
  for (const n of graph.nodes) {
    if (!n.title.trim()) errors.push('У каждого шага должен быть заголовок.');
    const exits = outgoing.get(n.id) ?? [];
    if (n.type !== 'conclusion' && exits.length === 0) errors.push(`У шага «${n.title || 'без названия'}» нет выхода.`);
    if (n.type === 'conclusion' && exits.length) errors.push(`У заключения «${n.title || 'без названия'}» не должно быть исходящих переходов.`);
    if (n.type === 'condition') {
      if (exits.length < 2) errors.push(`У условия «${n.title || 'без названия'}» должно быть не менее двух веток.`);
      if (exits.some(e => !e.condition?.label.trim())) errors.push(`Подпишите каждую ветку условия «${n.title || 'без названия'}».`);
      const labels = exits.map(e => e.condition?.label.trim().toLocaleLowerCase('ru')).filter(Boolean);
      if (new Set(labels).size !== labels.length) errors.push(`Названия веток условия «${n.title || 'без названия'}» должны различаться.`);
    }
  }
  const reachable = new Set<string>();
  const visit = (id: string) => { if (reachable.has(id) || !ids.has(id)) return; reachable.add(id); for (const e of outgoing.get(id) ?? []) visit(e.target); };
  visit(graph.startNodeId);
  if (graph.nodes.some(n => !reachable.has(n.id))) errors.push('Есть шаги, недоступные из стартового узла.');
  const reachesConclusion = new Set<string>();
  const mark = (id: string) => { if (reachesConclusion.has(id)) return; reachesConclusion.add(id); for (const e of incoming.get(id) ?? []) mark(e.source); };
  graph.nodes.filter(n => n.type === 'conclusion').forEach(n => mark(n.id));
  if (graph.nodes.some(n => !reachesConclusion.has(n.id))) errors.push('Из каждого шага должен существовать путь к заключению.');
  return [...new Set(errors)];
}

