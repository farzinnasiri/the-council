import { useEffect, useMemo, useState } from 'react';
import { Archive, MessageSquarePlus, Pencil, Plus, Save, Sparkles, Trash2, Upload, UserCircle2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { useAppStore } from '../store/appStore';
import { AvatarUploader } from '../components/members/AvatarUploader';
import { convexRepository } from '../repository/ConvexCouncilRepository';
import { suggestMemberSpecialties } from '../lib/geminiClient';

interface MemberFormState {
  name: string;
  specialties: string;
  systemPrompt: string;
}

const emptyForm: MemberFormState = {
  name: '',
  specialties: '',
  systemPrompt: '',
};

export function MembersPage() {
  const navigate = useNavigate();
  const members = useAppStore((state) => state.members);
  const createMember = useAppStore((state) => state.createMember);
  const updateMember = useAppStore((state) => state.updateMember);
  const archiveMember = useAppStore((state) => state.archiveMember);
  const uploadDocsForMember = useAppStore((state) => state.uploadDocsForMember);
  const fetchDocsForMember = useAppStore((state) => state.fetchDocsForMember);
  const deleteDocForMember = useAppStore((state) => state.deleteDocForMember);
  const docsByMember = useAppStore((state) => state.memberDocuments);

  const [isCreating, setIsCreating] = useState(false);
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [form, setForm] = useState<MemberFormState>(emptyForm);
  const [busyMemberId, setBusyMemberId] = useState<string | null>(null);
  const [deletingDocumentName, setDeletingDocumentName] = useState<string | null>(null);
  const [isSuggestingSpecialties, setIsSuggestingSpecialties] = useState(false);
  const [pendingAvatarBlob, setPendingAvatarBlob] = useState<Blob | null>(null);

  const activeMembers = useMemo(() => members.filter((member) => !member.deletedAt), [members]);
  const archivedMembers = useMemo(() => members.filter((member) => Boolean(member.deletedAt)), [members]);
  const editingMember = useMemo(() => members.find((item) => item.id === editingMemberId), [members, editingMemberId]);
  const editingDocs = editingMemberId ? docsByMember[editingMemberId] ?? [] : [];
  const isFormActive = isCreating || Boolean(editingMemberId);
  const showKbPanel = isCreating || Boolean(editingMemberId);

  useEffect(() => {
    if (!editingMemberId) {
      return;
    }
    setBusyMemberId(editingMemberId);
    void fetchDocsForMember(editingMemberId).finally(() => setBusyMemberId(null));
  }, [editingMemberId, fetchDocsForMember]);

  const startCreate = () => {
    setEditingMemberId(null);
    setForm(emptyForm);
    setIsCreating(true);
    setPendingAvatarBlob(null);
  };

  const startEdit = (memberId: string) => {
    const member = members.find((item) => item.id === memberId);
    if (!member) return;

    setEditingMemberId(memberId);
    setForm({
      name: member.name,
      specialties: member.specialties.join(', '),
      systemPrompt: member.systemPrompt,
    });
    setIsCreating(false);
    setPendingAvatarBlob(null);
  };

  const resetForm = () => {
    setIsCreating(false);
    setEditingMemberId(null);
    setForm(emptyForm);
    setDeletingDocumentName(null);
    setPendingAvatarBlob(null);
  };

  const uploadAvatarForMember = async (memberId: string, blob: Blob) => {
    const uploadUrl = await convexRepository.generateUploadUrl();
    const res = await fetch(uploadUrl, {
      method: 'POST',
      headers: { 'Content-Type': blob.type },
      body: blob,
    });
    const { storageId } = await res.json() as { storageId: string };
    const updated = await convexRepository.setMemberAvatar(memberId, storageId);
    useAppStore.setState((state) => ({
      members: state.members.map((m) =>
        m.id === memberId ? { ...m, avatarUrl: updated.avatarUrl } : m
      ),
    }));
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
      specialties: form.specialties
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
    };

    if (editingMemberId) {
      await updateMember(editingMemberId, payload);
    } else {
      const created = await createMember(payload);
      if (pendingAvatarBlob) {
        await uploadAvatarForMember(created.id, pendingAvatarBlob);
      }
      setEditingMemberId(created.id);
      setIsCreating(false);
      setPendingAvatarBlob(null);
      setForm({
        name: created.name,
        specialties: created.specialties.join(', '),
        systemPrompt: created.systemPrompt,
      });
      return;
    }
    resetForm();
  };

  const onUploadForEditingMember = async (files: FileList | null) => {
    if (!editingMemberId || !files || files.length === 0) {
      return;
    }

    setBusyMemberId(editingMemberId);
    try {
      await uploadDocsForMember(editingMemberId, Array.from(files));
      await fetchDocsForMember(editingMemberId);
    } finally {
      setBusyMemberId(null);
    }
  };

  const deleteDocument = async (documentName: string) => {
    if (!editingMemberId) {
      return;
    }

    setDeletingDocumentName(documentName);
    try {
      await deleteDocForMember(editingMemberId, documentName);
    } finally {
      setDeletingDocumentName(null);
    }
  };

  const generateSpecialties = async () => {
    const name = form.name.trim();
    const systemPrompt = form.systemPrompt.trim();
    if (!name || !systemPrompt) return;

    setIsSuggestingSpecialties(true);
    try {
      const result = await suggestMemberSpecialties({ name, systemPrompt });
      if (result.specialties.length > 0) {
        setForm((current) => ({
          ...current,
          specialties: result.specialties.join(', '),
        }));
      }
    } finally {
      setIsSuggestingSpecialties(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto px-4 py-5 md:px-8 md:py-8">
      <div className={`mx-auto grid w-full gap-6 ${isFormActive ? 'max-w-6xl lg:grid-cols-[1.2fr_1fr]' : 'max-w-2xl grid-cols-1'}`}>
        <section className={`space-y-4 ${isFormActive ? 'order-2 lg:order-1' : 'order-1'}`}>
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
            onEdit={startEdit}
            onArchive={(memberId) => {
              void archiveMember(memberId);
            }}
            onCreateChamber={async (memberId) => {
              navigate(`/chamber/member/${memberId}`);
            }}
          />

          {archivedMembers.length > 0 ? (
            <MemberList
              title="Archived"
              members={archivedMembers}
              docsByMember={docsByMember}
              onEdit={() => { }}
              onArchive={() => { }}
              onCreateChamber={() => Promise.resolve()}
              archived
            />
          ) : null}
        </section>

        {isFormActive && (
          <section className="order-1 rounded-2xl border border-border bg-card p-4 md:p-5 lg:order-2">
            <h2 className="font-display text-xl">{editingMemberId ? 'Edit member' : 'Create member'}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Set each member's identity and system prompt. Manage knowledge-base files from here.
            </p>

            <div className="mt-4 space-y-3">
              {/* Avatar + Name row */}
              <div className="flex items-start gap-3">
                <AvatarUploader
                  currentAvatarUrl={editingMember?.avatarUrl}
                  onUpload={async (blob) => {
                    if (!editingMemberId) {
                      setPendingAvatarBlob(blob);
                      return;
                    }
                    await uploadAvatarForMember(editingMemberId, blob);
                  }}
                />
                <label className="grid flex-1 gap-1 text-sm">
                  Name
                  <input
                    className="h-10 rounded-lg border border-border bg-background px-3"
                    value={form.name}
                    onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                    placeholder="Member name"
                  />
                </label>
              </div>

              {/* Specialties */}
              <label className="grid gap-1 text-sm">
                <span className="flex items-center justify-between gap-2">
                  <span>Specialties (comma-separated)</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1 text-xs"
                    disabled={!form.name.trim() || !form.systemPrompt.trim() || isSuggestingSpecialties}
                    onClick={() => void generateSpecialties()}
                    title="Suggest specialties with AI"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    {isSuggestingSpecialties ? 'Generating…' : 'AI'}
                  </Button>
                </span>
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

              {showKbPanel ? (
                <section className="mt-2 rounded-xl border border-border/80 bg-background p-3">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">Knowledge base documents</p>
                      <p className="text-xs text-muted-foreground">
                        {editingMember?.kbStoreName ? `Store: ${editingMember.kbStoreName.split('/').pop()}` : 'No KB store yet'}
                      </p>
                    </div>
                    <label
                      className={`inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs ${editingMemberId ? 'cursor-pointer hover:bg-muted/40' : 'cursor-not-allowed opacity-60'
                        }`}
                    >
                      <Upload className="h-3.5 w-3.5" />
                      Upload
                      <input
                        type="file"
                        multiple
                        className="hidden"
                        disabled={!editingMemberId}
                        onChange={(event) => {
                          void onUploadForEditingMember(event.target.files);
                          event.currentTarget.value = '';
                        }}
                      />
                    </label>
                  </div>

                  {!editingMemberId ? (
                    <p className="mb-2 text-xs text-muted-foreground">
                      Save this member first, then upload and manage KB documents.
                    </p>
                  ) : null}

                  {editingMemberId && busyMemberId === editingMemberId ? (
                    <p className="text-xs text-muted-foreground">Loading documents...</p>
                  ) : null}

                  {editingMemberId && editingDocs.length > 0 ? (
                    <div className="space-y-1.5">
                      {editingDocs.map((doc, index) => {
                        const key = doc.name ?? doc.displayName ?? `doc-${index}`;
                        return (
                          <div key={key} className="flex items-center justify-between rounded-md border border-border/70 px-2 py-1.5">
                            <span className="truncate pr-3 text-xs text-foreground/90">{doc.displayName ?? doc.name ?? 'Untitled document'}</span>
                            {doc.name ? (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                disabled={deletingDocumentName === doc.name}
                                onClick={() => void deleteDocument(doc.name as string)}
                                title="Delete document"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      {editingMemberId ? 'No documents yet. Upload files to add knowledge.' : 'Document upload becomes available after first save.'}
                    </p>
                  )}
                </section>
              ) : null}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function MemberList({
  title,
  members,
  docsByMember,
  onEdit,
  onArchive,
  onCreateChamber,
  archived = false,
}: {
  title: string;
  members: ReturnType<typeof useAppStore.getState>['members'];
  docsByMember: ReturnType<typeof useAppStore.getState>['memberDocuments'];
  onEdit: (memberId: string) => void;
  onArchive: (memberId: string) => void;
  onCreateChamber: (memberId: string) => Promise<void>;
  archived?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3 md:p-4">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">{title}</h2>
      <div className="grid gap-3">
        {members.map((member) => (
          <article key={member.id} className="rounded-xl border border-border/80 bg-background p-3">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-muted">
                {member.avatarUrl
                  ? <img src={member.avatarUrl} alt={member.name} className="h-full w-full object-cover" />
                  : <UserCircle2 className="h-6 w-6 text-muted-foreground/50" />
                }
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold">{member.name}</p>
                {member.specialties.length > 0 ? (
                  <p className="mt-1 text-xs text-muted-foreground">{member.specialties.join(' · ')}</p>
                ) : null}
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

              <span className="text-xs text-muted-foreground">Docs ({docsByMember[member.id]?.length ?? 0})</span>

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
