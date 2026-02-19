import type { Member } from '../types/domain';

interface RouteCandidate {
  id: string;
  name: string;
  specialties: string[];
  systemPrompt?: string;
}

export interface RouteResult {
  chosenMemberIds: string[];
  model: string;
  source: 'llm' | 'fallback';
}

interface MemberChatResult {
  answer: string;
  grounded: boolean;
  citations: Array<{ title: string; uri?: string }>;
  model: string;
  retrievalModel: string;
  usedKnowledgeBase: boolean;
  debug?: {
    traceId: string;
    mode: 'with-kb' | 'prompt-only';
    reason?: string;
    kbCheck?: {
      requestedStoreName: string | null;
      docsCount: number;
      listError?: string;
      fileSearchInvoked: boolean;
      gateDecision?: {
        mode: 'heuristic' | 'llm-gate';
        useKnowledgeBase: boolean;
        reason: string;
      };
    };
    fileSearchStart?: {
      storeName: string;
      retrievalModel: string;
      query: string;
      metadataFilter?: string;
    };
    fileSearchResponse?: {
      grounded: boolean;
      citationsCount: number;
      snippetsCount: number;
      retrievalText: string;
      citations: Array<{ title: string; uri?: string }>;
      snippets: string[];
    };
    answerPrompt: string;
  };
}

const baseHeaders = { 'Content-Type': 'application/json' };

async function parseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || `Request failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export async function routeHallMembers(input: {
  message: string;
  conversationId: string;
  candidates: RouteCandidate[];
  maxSelections?: number;
}): Promise<RouteResult> {
  const response = await fetch('/api/hall/route', {
    method: 'POST',
    headers: baseHeaders,
    body: JSON.stringify(input),
  });

  return parseJson<RouteResult>(response);
}

export async function ensureMemberStore(input: {
  memberId: string;
  memberName: string;
  storeName?: string | null;
}): Promise<{ storeName: string; created: boolean }> {
  const response = await fetch('/api/member-kb/ensure', {
    method: 'POST',
    headers: baseHeaders,
    body: JSON.stringify(input),
  });

  return parseJson<{ storeName: string; created: boolean }>(response);
}

export async function uploadMemberDocuments(input: {
  memberId: string;
  memberName: string;
  storeName?: string | null;
  files: File[];
}): Promise<{ storeName: string; documents: Array<{ name?: string; displayName?: string }> }> {
  const form = new FormData();
  form.append('memberId', input.memberId);
  form.append('memberName', input.memberName);
  if (input.storeName) {
    form.append('storeName', input.storeName);
  }

  for (const file of input.files) {
    form.append('documents', file);
  }

  const response = await fetch('/api/member-kb/upload', {
    method: 'POST',
    body: form,
  });

  return parseJson<{ storeName: string; documents: Array<{ name?: string; displayName?: string }> }>(response);
}

export async function listMemberDocuments(storeName: string): Promise<Array<{ name?: string; displayName?: string }>> {
  const params = new URLSearchParams({ storeName });
  const response = await fetch(`/api/member-kb/documents?${params.toString()}`);
  const body = await parseJson<{ documents: Array<{ name?: string; displayName?: string }> }>(response);
  return body.documents;
}

export async function deleteMemberDocument(input: {
  storeName: string;
  documentName: string;
}): Promise<Array<{ name?: string; displayName?: string }>> {
  const response = await fetch('/api/member-kb/document/delete', {
    method: 'POST',
    headers: baseHeaders,
    body: JSON.stringify(input),
  });
  const body = await parseJson<{ ok: boolean; documents?: Array<{ name?: string; displayName?: string }> }>(response);
  return body.documents ?? [];
}

export async function compactConversation(input: {
  conversationId: string;
  previousSummary?: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  messageIds: string[];
}): Promise<{ summary: string }> {
  const response = await fetch('/api/compact', {
    method: 'POST',
    headers: baseHeaders,
    body: JSON.stringify(input),
  });
  return parseJson<{ summary: string }>(response);
}

export async function chatWithMember(input: {
  message: string;
  member: Member;
  conversationId: string;
  storeName?: string | null;
  previousSummary?: string;
  contextMessages?: Array<{ role: 'user' | 'assistant'; content: string }>;
}): Promise<MemberChatResult> {
  const response = await fetch('/api/member-chat', {
    method: 'POST',
    headers: baseHeaders,
    body: JSON.stringify({
      message: input.message,
      conversationId: input.conversationId,
      memberId: input.member.id,
      memberName: input.member.name,
      memberSystemPrompt: input.member.systemPrompt,
      storeName: input.storeName ?? null,
      previousSummary: input.previousSummary ?? null,
      contextMessages: input.contextMessages ?? [],
    }),
  });

  const result = await parseJson<MemberChatResult>(response);

  if (result.debug) {
    const trace = result.debug.traceId;
    console.groupCollapsed(`[Council Debug][${trace}] ${input.member.name} (${result.debug.mode})`);
    if (result.debug.kbCheck) {
      console.log('KB Check', result.debug.kbCheck);
      if (result.debug.kbCheck.gateDecision) {
        console.log('KB Gate Decision', result.debug.kbCheck.gateDecision);
      }
    }
    if (result.debug.fileSearchStart) {
      console.log('File Search Request', result.debug.fileSearchStart);
    }
    if (result.debug.fileSearchResponse) {
      console.log('File Search Response', result.debug.fileSearchResponse);
    }
    console.log('Chat Model Prompt', result.debug.answerPrompt);
    if (result.debug.reason) {
      console.log('Fallback Reason', result.debug.reason);
    }
    console.groupEnd();
  }

  return result;
}
