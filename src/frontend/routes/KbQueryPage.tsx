import { FormEvent, useMemo, useState } from 'react';
import { useAction } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { Button } from '../components/ui/button';
import { Textarea } from '../components/ui/textarea';
import { useAppStore } from '../store/appStore';

type KbQueryResult = {
  docsCount: number;
  retrievalText: string;
  citations: Array<{ title: string; uri?: string }>;
  snippets: Array<{ text: string; citationIndices: number[] }>;
  grounded: boolean;
};

export function KbQueryPage() {
  const members = useAppStore((state) => state.members);
  const activeMembers = useMemo(() => members.filter((member) => !member.deletedAt), [members]);
  const runKbQuery = useAction(api.ai.knowledge.queryMemberKnowledgeChunks);
  const rehydrateMemberStore = useAction(api.ai.knowledge.rehydrateMemberKnowledgeStore);

  const [memberId, setMemberId] = useState<string>('');
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState<number>(5);
  const [loading, setLoading] = useState(false);
  const [rehydrating, setRehydrating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [result, setResult] = useState<KbQueryResult | null>(null);

  const selectedMemberName = useMemo(
    () => activeMembers.find((member) => member.id === memberId)?.name,
    [activeMembers, memberId]
  );

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setInfo(null);
    setResult(null);

    if (!memberId) {
      setError('Select a member.');
      return;
    }
    if (!query.trim()) {
      setError('Enter a query.');
      return;
    }

    setLoading(true);
    try {
      const payload = await runKbQuery({
        memberId: memberId as Id<'members'>,
        query: query.trim(),
        limit,
      });
      setResult(payload as KbQueryResult);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Query failed';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const onRehydrate = async () => {
    setError(null);
    setInfo(null);
    if (!memberId) {
      setError('Select a member first.');
      return;
    }
    setRehydrating(true);
    try {
      const payload = await rehydrateMemberStore({
        memberId: memberId as Id<'members'>,
        mode: 'all',
      });
      setInfo(`Reindexed ${payload.rehydratedCount} staged documents (skipped ${payload.skippedCount}).`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Reindex failed';
      setError(message);
    } finally {
      setRehydrating(false);
    }
  };

  return (
    <div className="mx-auto h-full w-full max-w-5xl overflow-y-auto px-4 py-6 md:px-8 md:py-8">
      <div className="rounded-2xl border border-border bg-card p-4 md:p-6">
        <h1 className="text-lg font-semibold tracking-tight">Temporary KB Query</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manually query one member knowledge base and inspect returned chunks.
        </p>

        <form className="mt-5 grid gap-4" onSubmit={onSubmit}>
          <label className="grid gap-1.5">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Member</span>
            <select
              value={memberId}
              onChange={(event) => setMemberId(event.target.value)}
              className="h-10 rounded-md border border-border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">Select member</option>
              {activeMembers.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </select>
          </label>

          <div className="grid gap-4 md:grid-cols-[1fr_140px]">
            <label className="grid gap-1.5">
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Query</span>
              <Textarea
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Ask your own KB question..."
                className="min-h-[120px] bg-background"
              />
            </label>

            <label className="grid gap-1.5">
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Chunks</span>
              <input
                type="number"
                min={1}
                max={20}
                value={limit}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  if (Number.isNaN(next)) return;
                  setLimit(Math.max(1, Math.min(20, next)));
                }}
                className="h-10 rounded-md border border-border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <p className="text-xs text-muted-foreground">Range: 1-20</p>
            </label>
          </div>

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={loading || activeMembers.length === 0}>
              {loading ? 'Running...' : 'Run query'}
            </Button>
            <Button type="button" variant="outline" onClick={() => void onRehydrate()} disabled={rehydrating || !memberId}>
              {rehydrating ? 'Reindexing...' : 'Reindex docs'}
            </Button>
            {selectedMemberName ? <p className="text-sm text-muted-foreground">Target: {selectedMemberName}</p> : null}
          </div>
        </form>

        <p className="mt-3 text-xs text-muted-foreground">
          Reindex docs refreshes chunk embeddings for all staged files of the selected member.
        </p>

        {error ? (
          <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        ) : null}
        {info ? (
          <div className="mt-4 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-foreground">
            {info}
          </div>
        ) : null}
      </div>

      {result ? (
        <div className="mt-5 space-y-4">
          <section className="rounded-2xl border border-border bg-card p-4 md:p-6">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Summary</h2>
            <div className="mt-2 grid gap-2 text-sm">
              <p>Grounded: {result.grounded ? 'yes' : 'no'}</p>
              <p>Documents indexed: {result.docsCount}</p>
              <p>Returned chunks: {result.snippets.length}</p>
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-card p-4 md:p-6">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Citations</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
              {result.citations.length === 0 ? <li>None</li> : null}
              {result.citations.map((citation, index) => (
                <li key={`${citation.title}-${index}`}>
                  S{index + 1}: {citation.title}
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-2xl border border-border bg-card p-4 md:p-6">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Chunks</h2>
            <div className="mt-3 space-y-3">
              {result.snippets.length === 0 ? <p className="text-sm text-muted-foreground">No chunks returned.</p> : null}
              {result.snippets.map((snippet, index) => (
                <article key={`snippet-${index}`} className="rounded-lg border border-border bg-background p-3">
                  <p className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">
                    Chunk {index + 1} · refs {snippet.citationIndices.map((idx) => `S${idx + 1}`).join(', ')}
                  </p>
                  <p className="whitespace-pre-wrap text-sm leading-6">{snippet.text}</p>
                </article>
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
