import { convexRepository } from '../repository/ConvexCouncilRepository';
import type { RoundtableState } from '../types/domain';

export interface RouteResult {
  chosenMemberIds: string[];
  model: string;
  source: 'llm' | 'fallback';
}

export interface HallTitleResult {
  title: string;
  model: string;
}

export interface MemberSpecialtiesResult {
  specialties: string[];
  model: string;
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
    queryPlan?: {
      originalQuery: string;
      standaloneQuery: string;
      queryAlternates: string[];
      gateUsed: boolean;
      gateReason: string;
      matchedDigestSignals: string[];
    };
    fileSearchStart?: {
      storeName: string;
      retrievalModel: string;
      query: string;
      metadataFilter?: string;
      alternateQuery?: string;
    };
    fileSearchResponse?: {
      grounded: boolean;
      citationsCount: number;
      snippetsCount: number;
      retrievalText: string;
      citations: Array<{ title: string; uri?: string }>;
      snippets: string[];
      queryUsed?: string;
      usedAlternateQuery?: boolean;
    };
    answerPrompt: string;
  };
}

async function uploadFileToConvexStorage(file: File): Promise<{ storageId: string; displayName: string; mimeType?: string; sizeBytes: number }> {
  const uploadUrl = await convexRepository.generateUploadUrl();
  const upload = await fetch(uploadUrl, {
    method: 'POST',
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
    body: file,
  });

  if (!upload.ok) {
    const body = await upload.text();
    throw new Error(body || `Upload failed: ${upload.status}`);
  }

  const payload = (await upload.json()) as { storageId: string };
  if (!payload.storageId) {
    throw new Error('Upload did not return a storageId');
  }

  return {
    storageId: payload.storageId,
    displayName: file.name,
    mimeType: file.type || undefined,
    sizeBytes: file.size,
  };
}

export async function routeHallMembers(input: {
  message: string;
  conversationId: string;
  maxSelections?: number;
}): Promise<RouteResult> {
  return await convexRepository.routeHallMembers({
    conversationId: input.conversationId,
    message: input.message,
    maxSelections: input.maxSelections,
  });
}

export async function suggestHallTitle(input: {
  message: string;
  model?: string;
}): Promise<HallTitleResult> {
  return await convexRepository.suggestHallTitle(input);
}

export async function suggestMemberSpecialties(input: {
  name: string;
  systemPrompt: string;
  model?: string;
}): Promise<MemberSpecialtiesResult> {
  return await convexRepository.suggestMemberSpecialties(input);
}

export async function ensureMemberStore(input: {
  memberId: string;
}): Promise<{ storeName: string; created: boolean }> {
  return await convexRepository.ensureMemberStore(input);
}

export async function uploadMemberDocuments(input: {
  memberId: string;
  files: File[];
}): Promise<{ storeName: string; documents: Array<{ name?: string; displayName?: string }> }> {
  const stagedFiles = await Promise.all(input.files.map((file) => uploadFileToConvexStorage(file)));
  return await convexRepository.uploadMemberDocuments({
    memberId: input.memberId,
    stagedFiles,
  });
}

export async function listMemberDocuments(memberId: string): Promise<Array<{ name?: string; displayName?: string }>> {
  return await convexRepository.listMemberDocuments({ memberId });
}

export async function deleteMemberDocument(input: {
  memberId: string;
  documentName: string;
}): Promise<Array<{ name?: string; displayName?: string }>> {
  const body = await convexRepository.deleteMemberDocument(input);
  return body.documents ?? [];
}

export async function compactConversation(input: {
  conversationId: string;
  previousSummary?: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  messageIds: string[];
  memoryScope?: 'chamber' | 'hall';
  memoryContext?: {
    conversationId: string;
    memberName: string;
    memberSpecialties: string[];
  };
}): Promise<{ summary: string }> {
  return await convexRepository.compactConversation(input);
}

export async function chatWithMember(input: {
  message: string;
  memberId: string;
  conversationId: string;
  previousSummary?: string;
  contextMessages?: Array<{ role: 'user' | 'assistant'; content: string }>;
  hallContext?: string;
}): Promise<MemberChatResult> {
  const result = await convexRepository.chatWithMember({
    conversationId: input.conversationId,
    memberId: input.memberId,
    message: input.message,
    previousSummary: input.previousSummary,
    contextMessages: input.contextMessages ?? [],
    hallContext: input.hallContext ?? undefined,
  });

  if (result.debug) {
    const trace = result.debug.traceId;
    console.groupCollapsed(`[Council Debug][${trace}] member:${input.memberId} (${result.debug.mode})`);
    if (result.debug.kbCheck) {
      console.log('KB Check', result.debug.kbCheck);
      if (result.debug.kbCheck.gateDecision) {
        console.log('KB Gate Decision', result.debug.kbCheck.gateDecision);
      }
    }
    if (result.debug.queryPlan) {
      console.log('Query Plan', result.debug.queryPlan);
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

export async function prepareRoundtableRound(input: {
  conversationId: string;
  trigger: 'user_message' | 'continue';
  triggerMessageId?: string;
  mentionedMemberIds?: string[];
}): Promise<RoundtableState> {
  return await convexRepository.prepareRoundtableRound(input);
}

export async function setRoundtableSelections(input: {
  conversationId: string;
  roundNumber: number;
  selectedMemberIds: string[];
}): Promise<RoundtableState> {
  return await convexRepository.setRoundtableSelections(input);
}

export async function markRoundtableInProgress(input: {
  conversationId: string;
  roundNumber: number;
}): Promise<RoundtableState> {
  return await convexRepository.markRoundtableInProgress(input);
}

export async function markRoundtableCompleted(input: {
  conversationId: string;
  roundNumber: number;
}): Promise<RoundtableState> {
  return await convexRepository.markRoundtableCompleted(input);
}

export async function getRoundtableState(conversationId: string): Promise<RoundtableState | null> {
  return await convexRepository.getRoundtableState(conversationId);
}

export async function chatRoundtableSpeaker(input: {
  conversationId: string;
  roundNumber: number;
  memberId: string;
}): Promise<MemberChatResult & { intent: 'speak' | 'challenge' | 'support'; targetMemberId?: string }> {
  return await convexRepository.chatRoundtableSpeaker(input);
}

export async function chatRoundtableSpeakers(input: {
  conversationId: string;
  roundNumber: number;
}): Promise<
  Array<{
    memberId: string;
    status: 'sent' | 'error';
    answer: string;
    intent: 'speak' | 'challenge' | 'support';
    targetMemberId?: string;
    error?: string;
  }>
> {
  return await convexRepository.chatRoundtableSpeakers(input);
}
