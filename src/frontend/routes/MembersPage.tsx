import { useMemo, useState } from 'react';
import { Archive, FileUp, MessageSquarePlus, Pencil, Plus, Save } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { useAppStore } from '../store/appStore';

interface MemberFormState {
  name: string;
  emoji: string;
  role: string;
  specialties: string;
  systemPrompt: string;
}

const emptyForm: MemberFormState = {
  name: '',
  emoji: '🧠',
  role: 'Advisor',
  specialties: '',
  systemPrompt: '',
};

export function MembersPage() {
  const navigate = useNavigate();
  const members = useAppStore((state) => state.members);
  const createMember = useAppStore((state) => state.createMember);
  const updateMember = useAppStore((state) => state.updateMember);
  const archiveMember = useAppStore((state) => state.archiveMember);
  const createChamberForMember = useAppStore((state) => state.createChamberForMember);
  const uploadDocsForMember = useAppStore((state) => state.uploadDocsForMember);
  const fetchDocsForMember = useAppStore((state) => state.fetchDocsForMember);
  const docsByMember = useAppStore((state) => state.memberDocuments);

  const [isCreating, setIsCreating] = useState(false);
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [form, setForm] = useState<MemberFormState>(emptyForm);
  const [busyMemberId, setBusyMemberId] = useState<string | null>(null);

  const activeMembers = useMemo(() => members.filter((member) => member.status === 'active'), [members]);
  const archivedMembers = useMemo(() => members.filter((member) => member.status === 'archived'), [members]);

  const startCreate = () => {
    setEditingMemberId(null);
    setForm(emptyForm);
    setIsCreating(true);
  };

  const startEdit = (memberId: string) => {
    const member = members.find((item) => item.id === memberId);
    if (!member) return;

    setEditingMemberId(memberId);
    setForm({
      name: member.name,
      emoji: member.emoji,
      role: member.role,
      specialties: member.specialties.join(', '),
      systemPrompt: member.systemPrompt,
    });
    setIsCreating(false);
  };

  const resetForm = () => {
    setIsCreating(false);
    setEditingMemberId(null);
    setForm(emptyForm);
  };

  const save = async () => {
    const name = form.name.trim();
    const prompt = form.systemPrompt.trim();
    if (!name || !prompt) {
      return;
    }

    const payload = {
      name,
      systemPrompt: prompt,
      emoji: form.emoji.trim() || '🧠',
      role: form.role.trim() || 'Advisor',
      specialties: form.specialties
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
    };

    if (editingMemberId) {
      await updateMember(editingMemberId, payload);
    } else {
      await createMember(payload);
    }
    resetForm();
  };

  const onUpload = async (memberId: string, files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusyMemberId(memberId);
    try {
      await uploadDocsForMember(memberId, Array.from(files));
      await fetchDocsForMember(memberId);
    } finally {
      setBusyMemberId(null);
    }
  };

  const viewDocs = async (memberId: string) => {
    setBusyMemberId(memberId);
    try {
      await fetchDocsForMember(memberId);
    } finally {
      setBusyMemberId(null);
    }
  };

  return (
    <div className="h-full overflow-y-auto px-4 py-5 md:px-8 md:py-8">
      <div className="mx-auto grid w-full max-w-6xl gap-6 lg:grid-cols-[1.2fr_1fr]">
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h1 className="font-display text-2xl">Members</h1>
            <Button variant="outline" className="gap-2" onClick={startCreate}>
              <Plus className="h-4 w-4" />
              New member
            </Button>
          </div>

          <MemberList
            title="Active"
            members={activeMembers}
            docsByMember={docsByMember}
            busyMemberId={busyMemberId}
            onEdit={startEdit}
            onArchive={(memberId) => {
              void archiveMember(memberId);
            }}
            onCreateChamber={async (memberId) => {
              const created = await createChamberForMember(memberId);
              navigate(`/chamber/${created.id}`);
            }}
            onUpload={onUpload}
            onViewDocs={viewDocs}
          />

          {archivedMembers.length > 0 ? (
            <MemberList
              title="Archived"
              members={archivedMembers}
              docsByMember={docsByMember}
              busyMemberId={busyMemberId}
              onEdit={() => {}}
              onArchive={() => {}}
              onCreateChamber={() => Promise.resolve()}
              onUpload={() => Promise.resolve()}
              onViewDocs={viewDocs}
              archived
            />
          ) : null}
        </section>

        <section className="rounded-2xl border border-border bg-card p-4 md:p-5">
          <h2 className="font-display text-xl">{editingMemberId ? 'Edit member' : isCreating ? 'Create member' : 'Member details'}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Set each member's identity and system prompt. Knowledge base is optional and can be uploaded anytime.
          </p>

          {isCreating || editingMemberId ? (
            <div className="mt-4 space-y-3">
              <label className="grid gap-1 text-sm">
                Name
                <input
                  className="h-10 rounded-lg border border-border bg-background px-3"
                  value={form.name}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                  placeholder="Member name"
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="grid gap-1 text-sm">
                  Emoji
                  <input
                    className="h-10 rounded-lg border border-border bg-background px-3"
                    value={form.emoji}
                    onChange={(event) => setForm((current) => ({ ...current, emoji: event.target.value }))}
                    placeholder="🧠"
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  Role
                  <input
                    className="h-10 rounded-lg border border-border bg-background px-3"
                    value={form.role}
                    onChange={(event) => setForm((current) => ({ ...current, role: event.target.value }))}
                    placeholder="Advisor"
                  />
                </label>
              </div>

              <label className="grid gap-1 text-sm">
                Specialties (comma-separated)
                <input
                  className="h-10 rounded-lg border border-border bg-background px-3"
                  value={form.specialties}
                  onChange={(event) => setForm((current) => ({ ...current, specialties: event.target.value }))}
                  placeholder="strategy, hiring, execution"
                />
              </label>

              <label className="grid gap-1 text-sm">
                System prompt
                <textarea
                  className="min-h-36 rounded-lg border border-border bg-background px-3 py-2"
                  value={form.systemPrompt}
                  onChange={(event) => setForm((current) => ({ ...current, systemPrompt: event.target.value }))}
                  placeholder="How should this member think and respond?"
                />
              </label>

              <div className="flex items-center gap-2">
                <Button className="gap-2" onClick={() => void save()} disabled={!form.name.trim() || !form.systemPrompt.trim()}>
                  <Save className="h-4 w-4" />
                  Save
                </Button>
                <Button variant="ghost" onClick={resetForm}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-4 rounded-xl border border-dashed border-border/80 p-5 text-sm text-muted-foreground">
              Select a member to edit, or create a new one.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function MemberList({
  title,
  members,
  docsByMember,
  busyMemberId,
  onEdit,
  onArchive,
  onCreateChamber,
  onUpload,
  onViewDocs,
  archived = false,
}: {
  title: string;
  members: ReturnType<typeof useAppStore.getState>['members'];
  docsByMember: ReturnType<typeof useAppStore.getState>['memberDocuments'];
  busyMemberId: string | null;
  onEdit: (memberId: string) => void;
  onArchive: (memberId: string) => void;
  onCreateChamber: (memberId: string) => Promise<void>;
  onUpload: (memberId: string, files: FileList | null) => Promise<void>;
  onViewDocs: (memberId: string) => Promise<void>;
  archived?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3 md:p-4">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">{title}</h2>
      <div className="grid gap-3">
        {members.map((member) => (
          <article key={member.id} className="rounded-xl border border-border/80 bg-background p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">{member.emoji} {member.name}</p>
                <p className="text-xs text-muted-foreground">{member.role}</p>
                {member.specialties.length > 0 ? (
                  <p className="mt-1 text-xs text-muted-foreground">{member.specialties.join(' · ')}</p>
                ) : null}
                <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{member.systemPrompt}</p>
              </div>

              {!archived ? (
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" onClick={() => onEdit(member.id)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => onArchive(member.id)}>
                    <Archive className="h-4 w-4" />
                  </Button>
                </div>
              ) : null}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              {!archived ? (
                <Button variant="outline" size="sm" className="gap-1" onClick={() => void onCreateChamber(member.id)}>
                  <MessageSquarePlus className="h-3.5 w-3.5" />
                  New chamber
                </Button>
              ) : null}

              {!archived ? (
                <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs hover:bg-muted/40">
                  <FileUp className="h-3.5 w-3.5" />
                  Upload docs
                  <input
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(event) => {
                      void onUpload(member.id, event.target.files);
                      event.currentTarget.value = '';
                    }}
                  />
                </label>
              ) : null}

              <Button
                variant="ghost"
                size="sm"
                className="text-xs"
                disabled={busyMemberId === member.id}
                onClick={() => void onViewDocs(member.id)}
              >
                {busyMemberId === member.id ? 'Loading...' : `Docs (${docsByMember[member.id]?.length ?? 0})`}
              </Button>

              {member.kbStoreName ? (
                <span className="text-[11px] text-muted-foreground">Store: {member.kbStoreName.split('/').pop()}</span>
              ) : (
                <span className="text-[11px] text-muted-foreground">No KB yet</span>
              )}
            </div>
          </article>
        ))}

        {members.length === 0 ? <p className="text-sm text-muted-foreground">No members in this section.</p> : null}
      </div>
    </div>
  );
}
