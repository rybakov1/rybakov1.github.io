"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { z } from "zod";
import type { Algorithm } from "./models";
import { algorithms as exampleAlgorithms } from "./seed";
import { validateGraph } from "./graph";

export type DemoRole = "user" | "admin";
export interface DemoUser { id: string; name: string; email: string; role: DemoRole }
export interface WorkspaceResult { ok: boolean; errors: string[] }

// These identities and their permissions exist only within this browser demo.
const identities: Record<DemoRole, DemoUser> = {
  user: { id: "demo-user", name: "Демо-диагност", email: "", role: "user" },
  admin: { id: "demo-admin", name: "Демо-администратор", email: "", role: "admin" },
};
const STORAGE_KEY = "diagdoc.workspace.v1";
const emptyResult = (): WorkspaceResult => ({ ok: true, errors: [] });
const failure = (...errors: string[]): WorkspaceResult => ({ ok: false, errors });

// Validate data read from the browser as well as incoming editor changes.
const edgeCondition = z.object({
  kind: z.enum(["choice", "comparison", "outcome"]), label: z.string(),
  operator: z.enum(["greater", "less"]).optional(), value: z.union([z.string(), z.number()]).optional(),
});
const nodeSchema = z.object({
  id: z.string().min(1), type: z.enum(["information", "action", "measurement", "condition", "conclusion"]),
  title: z.string(), text: z.string(), checkId: z.string().optional(),
  position: z.object({ x: z.number().finite(), y: z.number().finite() }),
});
const graphSchema = z.object({
  schemaVersion: z.literal(1), startNodeId: z.string(), nodes: z.array(nodeSchema),
  edges: z.array(z.object({ id: z.string().min(1), source: z.string(), target: z.string(), condition: edgeCondition.optional() })),
});
const algorithmSchema: z.ZodType<Algorithm> = z.object({
  id: z.string().min(1), title: z.string(), system: z.string(), summary: z.string(),
  applicability: z.array(z.string()), authorId: z.string().min(1), authorName: z.string().min(1),
  status: z.enum(["draft", "published", "hidden"]), version: z.number().int().nonnegative(), graph: graphSchema,
  entryConditions: z.array(z.string()), tools: z.array(z.string()), dtcIds: z.array(z.string()),
  symptomIds: z.array(z.string()), caseIds: z.array(z.string()), updatedAt: z.string(),
});
const savedSchema = z.object({
  schemaVersion: z.literal(1), role: z.enum(["user", "admin"]).nullable(),
  algorithms: z.array(algorithmSchema),
});
type SavedWorkspace = z.infer<typeof savedSchema>;

type WorkspaceContext = {
  ready: boolean;
  role: DemoRole | null;
  user: DemoUser | null;
  algorithms: Algorithm[];
  storageError: string | null;
  signIn: (role: DemoRole) => WorkspaceResult;
  signOut: () => WorkspaceResult;
  createAlgorithm: () => Algorithm | null;
  copyAlgorithm: (id: string) => Algorithm | null;
  saveAlgorithm: (algorithm: Algorithm) => WorkspaceResult;
  publishAlgorithm: (id: string) => WorkspaceResult;
  hideAlgorithm: (id: string) => WorkspaceResult;
};
const Context = createContext<WorkspaceContext | null>(null);

function combine(overrides: Algorithm[]): Algorithm[] {
  const byId = new Map(exampleAlgorithms.map(item => [item.id, item]));
  for (const item of overrides) byId.set(item.id, item);
  return [...byId.values()];
}
function newId(prefix: string): string {
  const value = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  return `${prefix}-${value}`;
}
function deepCopy<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [workspace, setWorkspace] = useState<SavedWorkspace>({ schemaVersion: 1, role: null, algorithms: [] });
  const [storageError, setStorageError] = useState<string | null>(null);
  const workspaceRef = useRef(workspace);
  const storageBlockedRef = useRef(false);
  const readyRef = useRef(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = savedSchema.safeParse(JSON.parse(raw));
        if (!parsed.success) throw new Error("Некорректный формат локальных данных");
        workspaceRef.current = parsed.data;
        setWorkspace(parsed.data);
      }
    } catch {
      storageBlockedRef.current = true;
      setStorageError("Не удалось прочитать локальные данные. Изменения не сохраняются; ранее сохранённые данные не перезаписаны.");
    }
    readyRef.current = true;
    setReady(true);
  }, []);

  const commit = useCallback((next: SavedWorkspace): WorkspaceResult => {
    if (!readyRef.current) return failure("Данные рабочего пространства ещё загружаются.");
    if (storageBlockedRef.current) return failure("Локальное хранилище недоступно. Изменения не сохранены.");
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      workspaceRef.current = next;
      setWorkspace(next);
      setStorageError(null);
      return emptyResult();
    } catch {
      setStorageError("Не удалось сохранить изменения в браузере. Проверьте доступность и свободное место локального хранилища.");
      return failure("Не удалось сохранить изменения в браузере.");
    }
  }, []);

  const signIn = useCallback((role: DemoRole): WorkspaceResult => {
    if (role !== "user" && role !== "admin") return failure("Неизвестная демо-роль.");
    return commit({ ...workspaceRef.current, role });
  }, [commit]);
  const signOut = useCallback((): WorkspaceResult => commit({ ...workspaceRef.current, role: null }), [commit]);

  const createAlgorithm = useCallback((): Algorithm | null => {
    const current = workspaceRef.current;
    if (!current.role) return null;
    const author = identities[current.role];
    const startId = newId("node");
    const item: Algorithm = {
      id: newId("algorithm"), title: "Новый алгоритм", system: "Двигатель", summary: "",
      applicability: ["Универсально"], authorId: author.id, authorName: author.name,
      status: "draft", version: 0,
      graph: { schemaVersion: 1, startNodeId: startId, nodes: [{ id: startId, type: "information", title: "Начало", text: "", position: { x: 80, y: 80 } }], edges: [] },
      entryConditions: [], tools: [], dtcIds: [], symptomIds: [], caseIds: [], updatedAt: new Date().toISOString(),
    };
    const result = commit({ ...current, algorithms: [...current.algorithms, item] });
    return result.ok ? deepCopy(item) : null;
  }, [commit]);

  const copyAlgorithm = useCallback((id: string): Algorithm | null => {
    const current = workspaceRef.current;
    if (!current.role) return null;
    const author = identities[current.role];
    const original = combine(current.algorithms).find(item => item.id === id);
    // Only public content, or the author's own material, can be copied.
    if (!original || (original.status !== "published" && original.authorId !== author.id && current.role !== "admin")) return null;
    const copy: Algorithm = { ...deepCopy(original), id: newId("algorithm"), title: `${original.title} — копия`, authorId: author.id, authorName: author.name, status: "draft", version: 0, updatedAt: new Date().toISOString() };
    const result = commit({ ...current, algorithms: [...current.algorithms, copy] });
    return result.ok ? deepCopy(copy) : null;
  }, [commit]);

  const saveAlgorithm = useCallback((incoming: Algorithm): WorkspaceResult => {
    const current = workspaceRef.current;
    if (!current.role) return failure("Сначала войдите в демо-режим.");
    const parsed = algorithmSchema.safeParse(incoming);
    if (!parsed.success) return failure("Не удалось сохранить: структура алгоритма некорректна.");
    const previous = combine(current.algorithms).find(item => item.id === parsed.data.id);
    if (!previous || previous.authorId !== identities[current.role].id) return failure("Изменять можно только свои алгоритмы.");
    if (previous.status !== "draft") return failure("Редактировать можно только черновик. Создайте копию опубликованного или скрытого алгоритма.");
    // Editing cannot bypass publication and ownership rules by changing these fields.
    const next: Algorithm = { ...parsed.data, authorId: previous.authorId, authorName: previous.authorName, status: previous.status, version: previous.version, updatedAt: new Date().toISOString() };
    return commit({ ...current, algorithms: [...current.algorithms.filter(item => item.id !== next.id), next] });
  }, [commit]);

  const publishAlgorithm = useCallback((id: string): WorkspaceResult => {
    const current = workspaceRef.current;
    if (!current.role) return failure("Сначала войдите в демо-режим.");
    const previous = combine(current.algorithms).find(item => item.id === id);
    if (!previous || previous.authorId !== identities[current.role].id) return failure("Публиковать можно только свои алгоритмы.");
    if (previous.status !== "draft") return failure("Опубликовать можно только черновик.");
    const errors = [...(!previous.title.trim() ? ["Укажите название алгоритма."] : []), ...validateGraph(previous.graph)];
    if (errors.length) return failure(...errors);
    const next: Algorithm = { ...previous, status: "published", version: previous.version + 1, updatedAt: new Date().toISOString() };
    return commit({ ...current, algorithms: [...current.algorithms.filter(item => item.id !== id), next] });
  }, [commit]);

  const hideAlgorithm = useCallback((id: string): WorkspaceResult => {
    const current = workspaceRef.current;
    if (current.role !== "admin") return failure("Скрывать материалы может только демо-администратор.");
    const previous = combine(current.algorithms).find(item => item.id === id);
    if (!previous) return failure("Алгоритм не найден.");
    if (previous.status !== "published") return failure("Скрыть можно только опубликованный алгоритм.");
    const next: Algorithm = { ...deepCopy(previous), status: "hidden", updatedAt: new Date().toISOString() };
    return commit({ ...current, algorithms: [...current.algorithms.filter(item => item.id !== id), next] });
  }, [commit]);

  const value = useMemo<WorkspaceContext>(() => ({
    ready, role: workspace.role, user: workspace.role ? identities[workspace.role] : null,
    algorithms: combine(workspace.algorithms).map(deepCopy), storageError,
    signIn, signOut, createAlgorithm, copyAlgorithm, saveAlgorithm, publishAlgorithm, hideAlgorithm,
  }), [ready, workspace, storageError, signIn, signOut, createAlgorithm, copyAlgorithm, saveAlgorithm, publishAlgorithm, hideAlgorithm]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useWorkspace(): WorkspaceContext {
  const value = useContext(Context);
  if (!value) throw new Error("useWorkspace must be used inside WorkspaceProvider");
  return value;
}

