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

export async function chatWithMember(input: {
  message: string;
  member: Member;
  conversationId: string;
  storeName?: string | null;
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
    }),
  });

  return parseJson<MemberChatResult>(response);
}
