import { useEffect, useMemo, useState } from 'react';
import { NavLink, useNavigate, useParams } from 'react-router-dom';
import { NotebookPen } from 'lucide-react';
import { useAppStore } from '../store/appStore';
import { cn } from '../lib/utils';
import { ConversationNotebookEditor } from '../features/notebook/ConversationNotebookEditor';
import { getConversationNotebookMeta } from '../features/notebook/notebookMeta';
import { formatSessionTime } from '../lib/time';

export function NotebooksPage() {
  const { conversationId } = useParams();
  const navigate = useNavigate();
  const [isMobile, setIsMobile] = useState(() => window.matchMedia('(max-width: 767px)').matches);
  const loadActiveNotebooks = useAppStore((state) => state.loadActiveNotebooks);
  const ensureNotebookLoaded = useAppStore((state) => state.ensureNotebookLoaded);
  const notebooksByConversation = useAppStore((state) => state.conversationNotebooksByConversation);
  const conversations = useAppStore((state) => state.conversations);

  useEffect(() => {
    void loadActiveNotebooks();
  }, [loadActiveNotebooks]);

  useEffect(() => {
    if (!conversationId) return;
    void ensureNotebookLoaded(conversationId);
  }, [conversationId, ensureNotebookLoaded]);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)');
    const onChange = (event: MediaQueryListEvent) => setIsMobile(event.matches);
    setIsMobile(media.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  const notebooks = useMemo(() => (
    Object.values(notebooksByConversation)
      .map((notebook) => ({
        notebook,
        conversation: conversations.find((conversation) => conversation.id === notebook.conversationId),
      }))
      .filter((item): item is { notebook: typeof item.notebook; conversation: NonNullable<typeof item.conversation> } => Boolean(item.conversation))
      .sort((a, b) => b.notebook.updatedAt - a.notebook.updatedAt)
  ), [conversations, notebooksByConversation]);

  const selectedConversation = conversationId
    ? conversations.find((conversation) => conversation.id === conversationId)
    : undefined;
  const selectedMeta = getConversationNotebookMeta(selectedConversation);

  if (isMobile && conversationId && selectedConversation) {
    return (
      <div className="flex h-full min-h-0 flex-col bg-background">
        <ConversationNotebookEditor
          conversationId={conversationId}
          title={selectedMeta.title}
          detail={selectedMeta.detail}
          variant="page"
          onClose={() => navigate('/notebooks')}
        />
      </div>
    );
  }

  return (
    <div className="h-full overflow-hidden bg-background">
      <div className="grid h-full min-h-0 md:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="border-r border-border">
          <div className="border-b border-border px-4 py-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <NotebookPen className="h-4 w-4 text-muted-foreground" />
              Notebooks
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Active conversation notes only.
            </p>
          </div>

          <div className="h-[calc(100%-73px)] overflow-y-auto p-2">
            {notebooks.length === 0 ? (
              <div className="px-2 py-4 text-sm text-muted-foreground">
                No notebooks yet.
              </div>
            ) : (
              <nav className="grid gap-1">
                {notebooks.map(({ notebook, conversation }) => {
                  const meta = getConversationNotebookMeta(conversation);
                  return (
                    <NavLink
                      key={notebook.id}
                      to={`/notebooks/${conversation.id}`}
                      className={({ isActive }) =>
                        cn(
                          'rounded-md border border-transparent px-3 py-2 text-sm transition-colors hover:bg-muted',
                          isActive && 'border-border bg-muted'
                        )
                      }
                    >
                      <div className="truncate font-medium">{conversation.title}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{meta.detail}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{formatSessionTime(notebook.updatedAt)}</div>
                    </NavLink>
                  );
                })}
              </nav>
            )}
          </div>
        </aside>

        <section className="flex min-h-0 bg-background">
          {conversationId && selectedConversation ? (
            <ConversationNotebookEditor
              conversationId={conversationId}
              title={selectedMeta.title}
              detail={selectedMeta.detail}
              variant="page"
            />
          ) : !isMobile ? (
            <div className="flex h-full items-center justify-center px-6 text-sm text-muted-foreground">
              Select a notebook from the list.
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
