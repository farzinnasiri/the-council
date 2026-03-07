import type { Conversation } from '../../types/domain';

export function getConversationNotebookMeta(conversation?: Conversation) {
  if (!conversation) {
    return {
      title: 'Notebook',
      detail: '',
    };
  }

  return {
    title: conversation.title,
    detail:
      conversation.kind === 'hall'
        ? conversation.hallMode === 'roundtable'
          ? 'Hall · Roundtable'
          : 'Hall · Advisory'
        : 'Chamber',
  };
}
