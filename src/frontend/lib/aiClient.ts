import { convexRepository } from '../repository/ConvexCouncilRepository';
import type { KbDocumentLifecycle } from '../repository/CouncilRepository';
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
        decision?: 'required' | 'helpful' | 'unnecessary';
        confidence?: number;
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

function logCouncilDebug(memberId: string, debug: MemberChatResult['debug'] | undefined) {
  if (!debug) return;
  const trace = debug.traceId;
  console.groupCollapsed(`[Council Debug][${trace}] member:${memberId} (${debug.mode})`);
  console.log('Raw Debug Payload', debug);
  if (debug.kbCheck) {
    console.log('KB Check', debug.kbCheck);
    if (debug.kbCheck.gateDecision) {
      console.log('KB Gate Decision', debug.kbCheck.gateDecision);
    }
  }
  if (debug.queryPlan) {
    console.log('Query Plan', debug.queryPlan);
  }
  if (debug.fileSearchStart) {
    console.log('File Search Request', debug.fileSearchStart);
  }
  if (debug.fileSearchResponse) {
    console.log('File Search Response', debug.fileSearchResponse);
  }
  console.log('Chat Model Prompt', debug.answerPrompt);
  if (debug.reason) {
    console.log('Fallback Reason', debug.reason);
  }
  console.groupEnd();
}

export async function uploadFileToConvexStorage(
  file: File,
  onProgress?: (payload: { loaded: number; total: number; progress: number }) => void
): Promise<{ storageId: string; displayName: string; mimeType?: string; sizeBytes: number }> {
  const uploadUrl = await convexRepository.generateUploadUrl();

  const payload = await new Promise<{ storageId: string }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', uploadUrl, true);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      onProgress?.({
        loaded: event.loaded,
        total: event.total,
        progress: Math.max(0, Math.min(1, event.loaded / event.total)),
      });
    };

    xhr.onerror = () => reject(new Error('Upload failed'));
    xhr.onabort = () => reject(new Error('Upload aborted'));
    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(xhr.responseText || `Upload failed: ${xhr.status}`));
        return;
      }
      try {
        const body = JSON.parse(xhr.responseText) as { storageId: string };
        if (!body.storageId) {
          reject(new Error('Upload did not return a storageId'));
          return;
        }
        resolve(body);
      } catch {
        reject(new Error('Invalid upload response'));
      }
    };

    xhr.send(file);
  });

  onProgress?.({
    loaded: file.size,
    total: file.size,
    progress: 1,
  });

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

export async function createKbDocumentRecord(input: {
  memberId: string;
  stagedFile: {
    storageId: string;
    displayName: string;
    mimeType?: string;
    sizeBytes?: number;
  };
}): Promise<{ kbDocumentId: string; document: KbDocumentLifecycle }> {
  return await convexRepository.createKbDocumentRecord(input);
}

export async function startKbDocumentProcessing(input: { kbDocumentId: string }): Promise<{ ok: boolean; document: KbDocumentLifecycle }> {
  return await convexRepository.startKbDocumentProcessing(input);
}

export async function retryKbDocumentIndexing(input: { kbDocumentId: string }): Promise<{ ok: boolean; document: KbDocumentLifecycle }> {
  return await convexRepository.retryKbDocumentIndexing(input);
}

export async function retryKbDocumentMetadata(input: { kbDocumentId: string }): Promise<{ ok: boolean; document: KbDocumentLifecycle }> {
  return await convexRepository.retryKbDocumentMetadata(input);
}

export async function listKbDocuments(memberId: string): Promise<KbDocumentLifecycle[]> {
  return await convexRepository.listKbDocuments({ memberId });
}

export async function deleteKbDocument(input: {
  kbDocumentId: string;
}): Promise<{ ok: boolean; alreadyDeleted?: boolean; deletedChunkCount?: number; clearedStoreName?: boolean; error?: string }> {
  return await convexRepository.deleteKbDocument(input);
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

  logCouncilDebug(input.memberId, result.debug);

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
  const result = await convexRepository.chatRoundtableSpeaker(input);
  if (result.debug) {
    logCouncilDebug(input.memberId, result.debug);
  } else {
    console.groupCollapsed(`[Council Debug][roundtable-no-debug] member:${input.memberId} (roundtable)`);
    console.log('Roundtable debug payload missing from backend response.');
    console.log('Raw Roundtable Response', result);
    console.log('Conversation', input.conversationId);
    console.log('Round', input.roundNumber);
    console.log('Intent', result.intent);
    console.log('Model', result.model);
    console.log('Retrieval Model', result.retrievalModel);
    console.groupEnd();
  }
  return result;
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
