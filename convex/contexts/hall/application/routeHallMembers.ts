'use node';

import { fallbackRouteMemberIds } from '../../../ai/graphs/fallbacks';
import { resolveModel } from '../../../ai/modelConfig';
import { assertHallConversationOpen, requireAuthUser, requireOwnedConversation } from '../../shared/auth';
import { createAiProvider } from '../../shared/convexGateway';
import { listActiveMembers } from '../infrastructure/membersRepo';
import type { RouteHallMembersInput, RouteHallMembersResult, NormalizedRouteCandidate } from '../contracts';
import { setMainSpanAttributes } from '../../../observability/wideEvents';
import { wideEventError } from '../../../observability/errors';

export async function routeHallMembersUseCase(ctx: any, args: RouteHallMembersInput): Promise<RouteHallMembersResult> {
  await requireAuthUser(ctx);
  const conversation = await requireOwnedConversation(ctx, args.conversationId);
  if (conversation.kind !== 'hall') {
    throw wideEventError('hall-routing-conversation-kind-invalid', 'Routing is only supported for hall conversations', {
      statusCode: 400,
    });
  }
  assertHallConversationOpen(conversation, {
    errorCode: 'hall-routing-conversation-closed',
    message: 'This table is closed.',
  });

  const candidates = await listActiveMembers(ctx);

  if (candidates.length === 0) {
    return {
      chosenMemberIds: [],
      model: 'none',
      source: 'fallback',
    };
  }

  const normalizedCandidates: NormalizedRouteCandidate[] = candidates.map((candidate) => ({
    id: candidate._id as string,
    name: candidate.name,
    specialties: candidate.specialties ?? [],
    systemPrompt: candidate.systemPrompt,
  }));

  const maxSelections = Math.max(1, Math.min(8, args.maxSelections ?? 3));
  const provider = createAiProvider();

  try {
    const routed = await provider.routeMembers({
      message: args.message,
      candidates: normalizedCandidates,
      maxSelections,
    });

    const chosen = routed.chosenMemberIds.filter((id) => normalizedCandidates.some((candidate) => candidate.id === id));
    if (chosen.length === 0) {
      setMainSpanAttributes({ 'routing.source': 'fallback' });
      return {
        chosenMemberIds: fallbackRouteMemberIds(args.message, normalizedCandidates, maxSelections),
        model: routed.model,
        source: 'fallback',
      };
    }

    setMainSpanAttributes({ 'routing.source': 'llm' });
    return {
      chosenMemberIds: chosen.slice(0, maxSelections),
      model: routed.model,
      source: 'llm',
    };
  } catch {
    setMainSpanAttributes({ 'routing.source': 'fallback' });
    return {
      chosenMemberIds: fallbackRouteMemberIds(args.message, normalizedCandidates, maxSelections),
      model: resolveModel('router'),
      source: 'fallback',
    };
  }
}
