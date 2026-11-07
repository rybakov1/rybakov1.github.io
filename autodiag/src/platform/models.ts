/** Published knowledge is independent from future diagnostic execution. */
export type MaterialStatus = 'draft' | 'published' | 'hidden';
export type NodeType = 'information' | 'action' | 'measurement' | 'condition' | 'conclusion';
export interface EdgeCondition { kind: 'choice' | 'comparison' | 'outcome'; label: string; operator?: 'greater' | 'less'; value?: string | number }
export interface AlgorithmNode { id: string; type: NodeType; title: string; text: string; checkId?: string; /** Visual placement only; never used to execute the graph. */ position: { x: number; y: number } }
export interface AlgorithmEdge { id: string; source: string; target: string; condition?: EdgeCondition }
export interface AlgorithmGraph { schemaVersion: 1; startNodeId: string; nodes: AlgorithmNode[]; edges: AlgorithmEdge[] }
export interface Algorithm { id: string; title: string; system: string; summary: string; applicability: string[]; authorId: string; authorName: string; status: MaterialStatus; version: number; graph: AlgorithmGraph; entryConditions: string[]; tools: string[]; dtcIds: string[]; symptomIds: string[]; caseIds: string[]; updatedAt: string }
export interface Check { id: string; title: string; system: string; goal: string; tools: string[]; steps: string[]; inputs: string[]; interpretation: string[]; warning: string; algorithmIds: string[] }
export interface Dtc { id: string; code: string; title: string; system: string; summary: string; symptomIds: string[]; algorithmIds: string[]; checkIds: string[] }
export interface Symptom { id: string; title: string; system: string; summary: string; algorithmIds: string[]; dtcIds: string[] }
export interface Article { id: string; title: string; summary: string; body: string[]; tags: string[]; algorithmIds: string[]; checkIds: string[]; sources?: { title: string; url: string }[] }
export interface Case { id: string; title: string; vehicleId: string; symptomIds: string[]; dtcIds: string[]; checkIds: string[]; algorithmIds: string[]; story: string[]; outcome: string }
export interface Vehicle { id: string; make: string; model: string; generation: string; engine: string; transmission: string }

/** Future version: an immutable snapshot prevents edits from changing an existing session. */
export interface DiagnosticSession { id: string; algorithmId: string; algorithmVersion: number; graphSnapshot: AlgorithmGraph; vehicleId?: string; vin?: string; status: 'in_progress' | 'completed' | 'cancelled'; startedAt: string; endedAt?: string }
export interface DiagnosticFact { id: string; sessionId: string; nodeId: string; checkId?: string; state: 'not_measured' | 'unknown' | 'observed'; observation?: string; createdAt: string }
export interface Measurement { id: string; sessionId: string; nodeId: string; checkId?: string; status: 'not_measured' | 'unknown' | 'measured'; value?: number; unit?: string; source: 'manual' | 'scanner' | 'scope'; context?: string; measuredAt?: string; origin?: string }
export interface DiagnosticHypothesis { id: string; sessionId: string; description: string; status: 'untested' | 'supported' | 'contradicted' | 'inconclusive'; supportingFactIds: string[]; contradictingFactIds: string[] }
export interface DiagnosticConclusion { id: string; sessionId: string; text: string; supportingFactIds: string[]; contradictingFactIds: string[]; hypothesisIds: string[]; createdAt: string }
