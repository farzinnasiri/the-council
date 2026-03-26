export type PromptTraceKind = 'chamber' | 'hall_advisory' | 'hall_roundtable';

export type PromptTraceSourceKind =
  | 'persona'
  | 'memory'
  | 'context'
  | 'question'
  | 'retrieval'
  | 'directive'
  | 'sentinel';

export type PromptTraceMetaValue = string | number | boolean | string[] | number[];
export type PromptTraceMeta = Record<string, PromptTraceMetaValue>;

export interface PromptTraceSection {
  key: string;
  label: string;
  content: string;
  sourceKind: PromptTraceSourceKind;
  meta?: PromptTraceMeta;
}

export interface PromptTraceRetrievalMetadata {
  plannerKbQueries: string[];
  secondPassKbQueries: string[];
  personalSourceQueries: string[];
  selectedKbDocumentNames: string[];
  knowledgeRouteMode?: string;
  knowledgeRouteSummary?: string;
  personalSourcePlanReason?: string;
}

export interface PromptTraceDraft {
  kind: PromptTraceKind;
  sections: PromptTraceSection[];
  retrieval: PromptTraceRetrievalMetadata;
  capturedAt: number;
}

export interface PromptTraceRecord extends PromptTraceDraft {
  id: string;
  conversationId: string;
  messageId: string;
  createdAt: number;
}

export function normalizePromptTraceContent(text: string | undefined): string {
  return (text ?? '').trim();
}

export function createPromptTraceSection(input: {
  key: string;
  label: string;
  content?: string;
  sourceKind: PromptTraceSourceKind;
  meta?: PromptTraceMeta;
}): PromptTraceSection | null {
  const content = normalizePromptTraceContent(input.content);
  if (!content) return null;
  return {
    key: input.key,
    label: input.label,
    content,
    sourceKind: input.sourceKind,
    meta: input.meta,
  };
}

export function renderPromptTraceSections(sections: PromptTraceSection[]): string {
  return sections
    .map((section) => normalizePromptTraceContent(section.content))
    .filter(Boolean)
    .join('\n\n');
}

export function formatPromptTraceQueryList(queries: string[]): string {
  return queries
    .map((query, index) => {
      const trimmed = normalizePromptTraceContent(query);
      return trimmed ? `${index + 1}. ${trimmed}` : '';
    })
    .filter(Boolean)
    .join('\n');
}
