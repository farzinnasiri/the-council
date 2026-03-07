import { useEffect } from 'react';
import { useAppStore } from '../../store/appStore';

export function useConversationNotebook(conversationId: string) {
  const ensureNotebookLoaded = useAppStore((state) => state.ensureNotebookLoaded);
  const saveNotebook = useAppStore((state) => state.saveNotebook);
  const setNotebookDraft = useAppStore((state) => state.setNotebookDraft);
  const notebook = useAppStore((state) => state.conversationNotebooksByConversation[conversationId]);
  const draft = useAppStore((state) => state.notebookDraftByConversation[conversationId] ?? '');
  const loaded = useAppStore((state) => state.notebookLoadedByConversation[conversationId] ?? false);
  const saveState = useAppStore((state) => state.notebookSaveStateByConversation[conversationId] ?? 'idle');
  const error = useAppStore((state) => state.notebookErrorByConversation[conversationId]);

  useEffect(() => {
    void ensureNotebookLoaded(conversationId);
  }, [conversationId, ensureNotebookLoaded]);

  useEffect(() => {
    if (!loaded) return;
    const baseline = notebook?.content ?? '';
    if (draft === baseline) return;

    const timeout = window.setTimeout(() => {
      void saveNotebook(conversationId);
    }, 450);

    return () => window.clearTimeout(timeout);
  }, [conversationId, draft, loaded, notebook?.content, saveNotebook]);

  useEffect(() => {
    return () => {
      const latest = useAppStore.getState();
      const latestDraft = latest.notebookDraftByConversation[conversationId] ?? '';
      const latestNotebook = latest.conversationNotebooksByConversation[conversationId];
      if (latestDraft === (latestNotebook?.content ?? '')) return;
      void latest.saveNotebook(conversationId);
    };
  }, [conversationId]);

  return {
    draft,
    loaded,
    saveState,
    error,
    setDraft: (content: string) => setNotebookDraft(conversationId, content),
    saveNow: () => saveNotebook(conversationId),
  };
}
