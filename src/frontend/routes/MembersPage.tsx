import { useEffect, useMemo, useState } from 'react';
import { Archive, CircleHelp, Download, Expand, Loader2, MessageSquarePlus, Pencil, Plus, RefreshCcw, Save, Sparkles, Trash2, Upload, UserCircle2 } from 'lucide-react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../components/ui/tooltip';
import { useAppStore } from '../store/appStore';
import { AvatarUploader } from '../components/members/AvatarUploader';
import { convexRepository } from '../repository/ConvexCouncilRepository';
import type { ChatResponseModelSlotOption, KbChunkConfig, KBDigestMetadata } from '../repository/CouncilRepository';
import { DEFAULT_MEMBER_VOICE, describeMemberVoice, MEMBER_VOICE_OPTIONS } from '../constants/memberVoice';
import {
  DEFAULT_KB_CHUNK_CONFIG,
  detectKbChunkPreset,
  getKbChunkPresetConfig,
  validateKbChunkConfig,
} from '../constants/kbChunking';
import type { MemberMemoryDocument, MemberMemoryEpisode, MemberMemoryRefreshState, MemberVoiceName, PersonalArchiveAccess } from '../types/domain';
import { suggestMemberSpecialties } from '../lib/aiClient';

interface MemberFormState {
  name: string;
  specialties: string;
  systemPrompt: string;
  chatResponseModelSlot: number;
  guidanceProfilePrompt: string;
  ttsVoiceName: MemberVoiceName;
  ttsPersonaPrompt: string;
  personalArchiveAccess: PersonalArchiveAccess;
}

interface DigestEditorState {
  digestId: string;
  kbDocumentId?: string;
  displayName: string;
  docType: string;
  about: string;
  bestFor: string;
  evidenceKinds: string;
  notFor: string;
  queryHints: string;
}

interface MemberMemoryBundleState {
  interactionPolicy: MemberMemoryDocument | null;
  mentalModel: MemberMemoryDocument | null;
  episodes: MemberMemoryEpisode[];
  refreshState: MemberMemoryRefreshState | null;
}

type ExpandedMemberMemoryEditor = 'interaction_policy' | 'mental_model';

const emptyForm: MemberFormState = {
  name: '',
  specialties: '',
  systemPrompt: '',
  chatResponseModelSlot: 1,
  guidanceProfilePrompt: '',
  ttsVoiceName: DEFAULT_MEMBER_VOICE,
  ttsPersonaPrompt: '',
  personalArchiveAccess: {
    reflection: false,
    cookieJar: false,
    accountability: false,
    worldModel: false,
  },
};

export function MembersPage() {
  const navigate = useNavigate();
  const members = useAppStore((state) => state.members);
  const createMember = useAppStore((state) => state.createMember);
  const updateMember = useAppStore((state) => state.updateMember);
  const generateMemberGuidanceProfile = useAppStore((state) => state.generateMemberGuidanceProfile);
  const generateMemberVoicePersona = useAppStore((state) => state.generateMemberVoicePersona);
  const archiveMember = useAppStore((state) => state.archiveMember);
  const uploadDocsForMember = useAppStore((state) => state.uploadDocsForMember);
  const fetchDocsForMember = useAppStore((state) => state.fetchDocsForMember);
  const hydrateMemberDocuments = useAppStore((state) => state.hydrateMemberDocuments);
  const deleteDocForMember = useAppStore((state) => state.deleteDocForMember);
  const retryKbDocumentIndexForMember = useAppStore((state) => state.retryKbDocumentIndexForMember);
  const retryKbDocumentMetadataForMember = useAppStore((state) => state.retryKbDocumentMetadataForMember);
  const kbDocumentsByMember = useAppStore((state) => state.kbDocumentsByMember);
  const kbUploadProgressByMember = useAppStore((state) => state.kbUploadProgressByMember);
  const kbDeletingDocumentIds = useAppStore((state) => state.kbDeletingDocumentIds);
  const kbRetryingIndexDocumentIds = useAppStore((state) => state.kbRetryingIndexDocumentIds);
  const kbRetryingMetadataDocumentIds = useAppStore((state) => state.kbRetryingMetadataDocumentIds);
  const kbReprocessingDocumentIds = useAppStore((state) => state.kbReprocessingDocumentIds);
  const reprocessKbDocumentForMember = useAppStore((state) => state.reprocessKbDocumentForMember);

  const [isCreating, setIsCreating] = useState(false);
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [form, setForm] = useState<MemberFormState>(emptyForm);
  const [busyMemberId, setBusyMemberId] = useState<string | null>(null);
  const [chatResponseModelSlots, setChatResponseModelSlots] = useState<ChatResponseModelSlotOption[]>([]);
  const [kbPanelError, setKbPanelError] = useState<string | null>(null);
  const [isSuggestingSpecialties, setIsSuggestingSpecialties] = useState(false);
  const [pendingAvatarBlob, setPendingAvatarBlob] = useState<Blob | null>(null);
  const [isPromptDialogOpen, setIsPromptDialogOpen] = useState(false);
  const [promptDialogValue, setPromptDialogValue] = useState('');
  const [isGuidanceDialogOpen, setIsGuidanceDialogOpen] = useState(false);
  const [guidanceDialogValue, setGuidanceDialogValue] = useState('');
  const [isGeneratingGuidance, setIsGeneratingGuidance] = useState(false);
  const [isVoicePersonaDialogOpen, setIsVoicePersonaDialogOpen] = useState(false);
  const [voicePersonaDialogValue, setVoicePersonaDialogValue] = useState('');
  const [isGeneratingVoicePersona, setIsGeneratingVoicePersona] = useState(false);
  const [kbDigests, setKbDigests] = useState<KBDigestMetadata[]>([]);
  const [isDigestLoading, setIsDigestLoading] = useState(false);
  const [digestLoadError, setDigestLoadError] = useState<string | null>(null);
  const [digestEditor, setDigestEditor] = useState<DigestEditorState | null>(null);
  const [isDigestEditorOpen, setIsDigestEditorOpen] = useState(false);
  const [isSavingDigest, setIsSavingDigest] = useState(false);
  const [isRetryingDigestFromEditor, setIsRetryingDigestFromEditor] = useState(false);
  const [downloadingKbDocumentId, setDownloadingKbDocumentId] = useState<string | null>(null);
  const [uploadChunkConfig, setUploadChunkConfig] = useState<KbChunkConfig>(DEFAULT_KB_CHUNK_CONFIG);
  const [docChunkConfigDrafts, setDocChunkConfigDrafts] = useState<Record<string, KbChunkConfig>>({});
  const [memberMemoryBundle, setMemberMemoryBundle] = useState<MemberMemoryBundleState | null>(null);
  const [isMemberMemoryLoading, setIsMemberMemoryLoading] = useState(false);
  const [memberMemoryError, setMemberMemoryError] = useState<string | null>(null);
  const [isMemberMemoryDialogOpen, setIsMemberMemoryDialogOpen] = useState(false);
  const [expandedMemberMemoryEditor, setExpandedMemberMemoryEditor] = useState<ExpandedMemberMemoryEditor | null>(null);

  const activeMembers = useMemo(() => members.filter((member) => !member.deletedAt), [members]);
  const archivedMembers = useMemo(() => members.filter((member) => Boolean(member.deletedAt)), [members]);
  const editingMember = useMemo(() => members.find((item) => item.id === editingMemberId), [members, editingMemberId]);
  const editingDocs = editingMemberId ? kbDocumentsByMember[editingMemberId] ?? [] : [];
  const editingUploadProgress = editingMemberId ? kbUploadProgressByMember[editingMemberId] ?? [] : [];
  const anyUploadInProgress = useMemo(
    () => Object.values(kbUploadProgressByMember).some((rows) => rows.length > 0),
    [kbUploadProgressByMember]
  );
  const isFormActive = isCreating || Boolean(editingMemberId);
  const showKbPanel = isCreating || Boolean(editingMemberId);

  useEffect(() => {
    void hydrateMemberDocuments();
  }, [hydrateMemberDocuments]);

  useEffect(() => {
    void convexRepository
      .listChatResponseModelSlots()
      .then((slots) => setChatResponseModelSlots(slots))
      .catch(() => setChatResponseModelSlots([]));
  }, []);

  useEffect(() => {
    if (!editingMemberId) {
      setKbDigests([]);
      setDigestLoadError(null);
      setKbPanelError(null);
      setDocChunkConfigDrafts({});
      setMemberMemoryBundle(null);
      setMemberMemoryError(null);
      setIsMemberMemoryDialogOpen(false);
      setExpandedMemberMemoryEditor(null);
      return;
    }
    setBusyMemberId(editingMemberId);
    setIsDigestLoading(true);
    setDigestLoadError(null);
    setIsMemberMemoryLoading(true);
    setMemberMemoryError(null);
    void fetchDocsForMember(editingMemberId).finally(() => setBusyMemberId(null));
    void convexRepository.listMemberDigestMetadata({ memberId: editingMemberId })
      .then((rows) => setKbDigests(rows))
      .catch((error) => {
        setKbDigests([]);
        setDigestLoadError('Could not load metadata. Please reopen edit mode or refresh.');
      })
      .finally(() => {
        setBusyMemberId(null);
        setIsDigestLoading(false);
      });
    void convexRepository.getMemberMemoryBundle(editingMemberId)
      .then((bundle) => setMemberMemoryBundle(bundle))
      .catch(() => setMemberMemoryError('Could not load member memory.'))
      .finally(() => setIsMemberMemoryLoading(false));
  }, [editingMemberId, fetchDocsForMember]);

  useEffect(() => {
    if (!editingMemberId) return;
    const hasInFlightProcessing = editingDocs.some(
      (doc) =>
        doc.chunkingStatus === 'pending' ||
        doc.chunkingStatus === 'running' ||
        doc.indexingStatus === 'pending' ||
        doc.indexingStatus === 'running' ||
        doc.metadataStatus === 'pending' ||
        doc.metadataStatus === 'running'
    );
    if (!hasInFlightProcessing) return;

    const timer = window.setInterval(() => {
      void fetchDocsForMember(editingMemberId);
      void convexRepository.listMemberDigestMetadata({ memberId: editingMemberId })
        .then((rows) => setKbDigests(rows))
        .catch(() => undefined);
    }, 2500);

    return () => window.clearInterval(timer);
  }, [editingDocs, editingMemberId, fetchDocsForMember]);

  useEffect(() => {
    if (!anyUploadInProgress) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [anyUploadInProgress]);

  const startCreate = () => {
    setEditingMemberId(null);
    setForm(emptyForm);
    setIsCreating(true);
    setPendingAvatarBlob(null);
    setUploadChunkConfig(DEFAULT_KB_CHUNK_CONFIG);
    setDocChunkConfigDrafts({});
    setKbDigests([]);
    setDigestLoadError(null);
    setDigestEditor(null);
    setIsDigestEditorOpen(false);
    setMemberMemoryBundle(null);
    setMemberMemoryError(null);
    setIsMemberMemoryDialogOpen(false);
    setExpandedMemberMemoryEditor(null);
  };

  const startEdit = (memberId: string) => {
    const member = members.find((item) => item.id === memberId);
    if (!member) return;

    setEditingMemberId(memberId);
    setForm({
      name: member.name,
      specialties: member.specialties.join(', '),
      systemPrompt: member.systemPrompt,
      chatResponseModelSlot: member.chatResponseModelSlot ?? 1,
      guidanceProfilePrompt: member.guidanceProfilePrompt ?? '',
      ttsVoiceName: member.ttsVoiceName,
      ttsPersonaPrompt: member.ttsPersonaPrompt ?? '',
      personalArchiveAccess: member.personalArchiveAccess,
    });
    setIsCreating(false);
    setPendingAvatarBlob(null);
    setUploadChunkConfig(DEFAULT_KB_CHUNK_CONFIG);
    setDocChunkConfigDrafts({});
    setDigestLoadError(null);
    setDigestEditor(null);
    setIsDigestEditorOpen(false);
    setMemberMemoryError(null);
    setIsMemberMemoryDialogOpen(false);
    setExpandedMemberMemoryEditor(null);
  };

  const resetForm = () => {
    setIsCreating(false);
    setEditingMemberId(null);
    setForm(emptyForm);
    setPendingAvatarBlob(null);
    setIsPromptDialogOpen(false);
    setPromptDialogValue('');
    setIsGuidanceDialogOpen(false);
    setGuidanceDialogValue('');
    setIsVoicePersonaDialogOpen(false);
    setVoicePersonaDialogValue('');
    setKbDigests([]);
    setDigestLoadError(null);
    setKbPanelError(null);
    setUploadChunkConfig(DEFAULT_KB_CHUNK_CONFIG);
    setDocChunkConfigDrafts({});
    setDigestEditor(null);
    setIsDigestEditorOpen(false);
    setMemberMemoryBundle(null);
    setMemberMemoryError(null);
    setIsMemberMemoryDialogOpen(false);
    setExpandedMemberMemoryEditor(null);
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
      chatResponseModelSlot: form.chatResponseModelSlot,
      guidanceProfilePrompt: form.guidanceProfilePrompt.trim() || undefined,
      ttsVoiceName: form.ttsVoiceName,
      ttsPersonaPrompt: form.ttsPersonaPrompt.trim() || undefined,
      specialties: form.specialties
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
      personalArchiveAccess: form.personalArchiveAccess,
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
        chatResponseModelSlot: created.chatResponseModelSlot ?? 1,
        guidanceProfilePrompt: created.guidanceProfilePrompt ?? '',
        ttsVoiceName: created.ttsVoiceName,
        ttsPersonaPrompt: created.ttsPersonaPrompt ?? '',
        personalArchiveAccess: created.personalArchiveAccess,
      });
      return;
    }
    resetForm();
  };

  const onUploadForEditingMember = async (files: FileList | null) => {
    if (!editingMemberId || !files || files.length === 0) {
      return;
    }

    const configError = validateKbChunkConfig(uploadChunkConfig);
    if (configError) {
      setKbPanelError(configError);
      return;
    }

    setBusyMemberId(editingMemberId);
    try {
      await uploadDocsForMember(editingMemberId, Array.from(files), uploadChunkConfig);
      await fetchDocsForMember(editingMemberId);
      const rows = await convexRepository.listMemberDigestMetadata({ memberId: editingMemberId });
      setKbDigests(rows);
      setDigestLoadError(null);
      setKbPanelError(null);
    } catch (error) {
      setKbPanelError(error instanceof Error ? error.message : 'Upload failed');
    } finally {
      setBusyMemberId(null);
    }
  };

  const deleteDocument = async (kbDocumentId: string) => {
    if (!editingMemberId) {
      return;
    }

    const result = await deleteDocForMember(editingMemberId, kbDocumentId);
    if (!result.ok) {
      setKbPanelError(result.error ?? 'Delete failed');
      return;
    }
    const rows = await convexRepository.listMemberDigestMetadata({ memberId: editingMemberId });
    setKbDigests(rows);
    setDigestLoadError(null);
    setKbPanelError(null);
  };

  const retryIndexing = async (kbDocumentId: string) => {
    if (!editingMemberId) return;
    const result = await retryKbDocumentIndexForMember(editingMemberId, kbDocumentId);
    if (!result.ok) {
      setKbPanelError(result.error ?? 'Retry indexing failed');
      return;
    }
    setKbPanelError(null);
  };

  const retryMetadata = async (kbDocumentId: string) => {
    if (!editingMemberId) return;
    const result = await retryKbDocumentMetadataForMember(editingMemberId, kbDocumentId);
    if (!result.ok) {
      setKbPanelError(result.error ?? 'Retry metadata failed');
      return;
    }
    setKbPanelError(null);
  };

  const reprocessDocument = async (kbDocumentId: string) => {
    if (!editingMemberId) return;
    const lifecycleDoc = editingDocs.find((item) => item.id === kbDocumentId);
    if (!lifecycleDoc) return;

    const nextConfig = docChunkConfigDrafts[kbDocumentId] ?? lifecycleDoc.chunkConfig;
    const configError = validateKbChunkConfig(nextConfig);
    if (configError) {
      setKbPanelError(configError);
      return;
    }

    const result = await reprocessKbDocumentForMember(editingMemberId, kbDocumentId, nextConfig);
    if (!result.ok) {
      setKbPanelError(result.error ?? 'Reprocess failed');
      return;
    }

    setDocChunkConfigDrafts((current) => {
      const next = { ...current };
      delete next[kbDocumentId];
      return next;
    });
    const rows = await convexRepository.listMemberDigestMetadata({ memberId: editingMemberId });
    setKbDigests(rows);
    setDigestLoadError(null);
    setKbPanelError(null);
  };

  const downloadDocument = async (kbDocumentId: string, displayName: string) => {
    setDownloadingKbDocumentId(kbDocumentId);
    try {
      const url = await convexRepository.getKbDocumentDownloadUrl({ kbDocumentId });
      if (!url) {
        throw new Error('Download unavailable for this document');
      }

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Download failed');
      }

      const blob = await response.blob();
      const objectUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = displayName || 'document';
      document.body.append(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(objectUrl);
      setKbPanelError(null);
    } catch (error) {
      setKbPanelError(error instanceof Error ? error.message : 'Download failed');
    } finally {
      setDownloadingKbDocumentId(null);
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

  const openPromptDialog = () => {
    setPromptDialogValue(form.systemPrompt);
    setIsPromptDialogOpen(true);
  };

  const savePromptDialog = () => {
    setForm((current) => ({ ...current, systemPrompt: promptDialogValue }));
    setIsPromptDialogOpen(false);
  };

  const openGuidanceDialog = () => {
    setGuidanceDialogValue(form.guidanceProfilePrompt);
    setIsGuidanceDialogOpen(true);
  };

  const saveGuidanceDialog = () => {
    setForm((current) => ({ ...current, guidanceProfilePrompt: guidanceDialogValue }));
    setIsGuidanceDialogOpen(false);
  };

  const openVoicePersonaDialog = () => {
    setVoicePersonaDialogValue(form.ttsPersonaPrompt);
    setIsVoicePersonaDialogOpen(true);
  };

  const saveVoicePersonaDialog = () => {
    setForm((current) => ({ ...current, ttsPersonaPrompt: voicePersonaDialogValue }));
    setIsVoicePersonaDialogOpen(false);
  };

  const generateGuidance = async () => {
    const targetMemberId = editingMemberId;
    if (!targetMemberId) return;
    setIsGeneratingGuidance(true);
    try {
      const result = await generateMemberGuidanceProfile(targetMemberId, true);
      setForm((current) => ({ ...current, guidanceProfilePrompt: result.guidanceProfilePrompt }));
      setGuidanceDialogValue(result.guidanceProfilePrompt);
    } finally {
      setIsGeneratingGuidance(false);
    }
  };

  const generateVoicePersona = async () => {
    const targetMemberId = editingMemberId;
    if (!targetMemberId) return;
    setIsGeneratingVoicePersona(true);
    try {
      const result = await generateMemberVoicePersona(targetMemberId, true);
      setForm((current) => ({ ...current, ttsPersonaPrompt: result.ttsPersonaPrompt }));
      setVoicePersonaDialogValue(result.ttsPersonaPrompt);
    } finally {
      setIsGeneratingVoicePersona(false);
    }
  };

  const listToText = (items: string[]) => items.join(', ');

  const textToList = (value: string) =>
    value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);

  const openDigestEditor = (digest: KBDigestMetadata, kbDocumentId?: string) => {
    setDigestEditor({
      digestId: digest.id,
      kbDocumentId,
      displayName: digest.displayName,
      docType: digest.documentCard.docType,
      about: digest.documentCard.about,
      bestFor: listToText(digest.documentCard.bestFor),
      evidenceKinds: listToText(digest.documentCard.evidenceKinds),
      notFor: listToText(digest.documentCard.notFor),
      queryHints: listToText(digest.queryHints),
    });
    setIsDigestEditorOpen(true);
  };

  const saveDigestEditor = async () => {
    if (!digestEditor || !editingMemberId) return;
    setIsSavingDigest(true);
    try {
      await convexRepository.updateMemberDigestMetadata({
        digestId: digestEditor.digestId,
        displayName: digestEditor.displayName.trim() || 'Untitled document',
        documentCard: {
          docType: digestEditor.docType.trim() || 'other',
          about: digestEditor.about.trim(),
          bestFor: textToList(digestEditor.bestFor),
          evidenceKinds: textToList(digestEditor.evidenceKinds),
          notFor: textToList(digestEditor.notFor),
        },
        queryHints: textToList(digestEditor.queryHints),
      });
      const rows = await convexRepository.listMemberDigestMetadata({ memberId: editingMemberId });
      setKbDigests(rows);
      setDigestLoadError(null);
      setIsDigestEditorOpen(false);
    } finally {
      setIsSavingDigest(false);
    }
  };

  const retryDigestEditorMetadata = async () => {
    if (!editingMemberId || !digestEditor?.kbDocumentId) return;
    setIsRetryingDigestFromEditor(true);
    try {
      const result = await retryKbDocumentMetadataForMember(editingMemberId, digestEditor.kbDocumentId);
      if (!result.ok) {
        setKbPanelError(result.error ?? 'Retry metadata failed');
        return;
      }

      await fetchDocsForMember(editingMemberId);
      const rows = await convexRepository.listMemberDigestMetadata({ memberId: editingMemberId });
      setKbDigests(rows);
      setDigestLoadError(null);
      setKbPanelError(null);

      const refreshed = rows.find((item) => item.id === digestEditor.digestId);
      if (refreshed) {
        setDigestEditor((current) =>
          current
            ? {
                ...current,
                displayName: refreshed.displayName,
                docType: refreshed.documentCard.docType,
                about: refreshed.documentCard.about,
                bestFor: listToText(refreshed.documentCard.bestFor),
                evidenceKinds: listToText(refreshed.documentCard.evidenceKinds),
                notFor: listToText(refreshed.documentCard.notFor),
                queryHints: listToText(refreshed.queryHints),
              }
            : current
        );
      }
    } finally {
      setIsRetryingDigestFromEditor(false);
    }
  };

  const refreshMemberMemory = async (force = false) => {
    if (!editingMemberId) return;
    setIsMemberMemoryLoading(true);
    setMemberMemoryError(null);
    try {
      await convexRepository.queueMemberMemoryRefresh({ memberId: editingMemberId, force });
      const bundle = await convexRepository.getMemberMemoryBundle(editingMemberId);
      setMemberMemoryBundle(bundle);
    } catch (error) {
      setMemberMemoryError(error instanceof Error ? error.message : 'Could not refresh member memory.');
    } finally {
      setIsMemberMemoryLoading(false);
    }
  };

  const updateMemberMemoryDocumentBody = (kind: ExpandedMemberMemoryEditor, body: string) => {
    setMemberMemoryBundle((current) => {
      if (!current || !editingMemberId) return current;
      if (kind === 'interaction_policy') {
        return {
          ...current,
          interactionPolicy: current.interactionPolicy
            ? { ...current.interactionPolicy, body }
            : {
                id: 'draft-interaction-policy',
                memberId: editingMemberId,
                body,
                lockedByUser: true,
                generatedAt: Date.now(),
                updatedAt: Date.now(),
              },
        };
      }
      return {
        ...current,
        mentalModel: current.mentalModel
          ? { ...current.mentalModel, body }
          : {
              id: 'draft-mental-model',
              memberId: editingMemberId,
              body,
              lockedByUser: true,
              generatedAt: Date.now(),
              updatedAt: Date.now(),
            },
      };
    });
  };

  const saveInteractionPolicy = async () => {
    if (!editingMemberId || !memberMemoryBundle?.interactionPolicy) return;
    setMemberMemoryError(null);
    try {
      const saved = await convexRepository.saveMemberInteractionPolicy({
        memberId: editingMemberId,
        body: memberMemoryBundle.interactionPolicy.body,
      });
      setMemberMemoryBundle((current) => current ? { ...current, interactionPolicy: saved } : current);
    } catch (error) {
      setMemberMemoryError(error instanceof Error ? error.message : 'Could not save interaction policy.');
    }
  };

  const saveMentalModel = async () => {
    if (!editingMemberId || !memberMemoryBundle?.mentalModel) return;
    setMemberMemoryError(null);
    try {
      const saved = await convexRepository.saveMemberMentalModel({
        memberId: editingMemberId,
        body: memberMemoryBundle.mentalModel.body,
      });
      setMemberMemoryBundle((current) => current ? { ...current, mentalModel: saved } : current);
    } catch (error) {
      setMemberMemoryError(error instanceof Error ? error.message : 'Could not save mental model.');
    }
  };

  const unlockMemberMemory = async (kind: 'interaction_policy' | 'mental_model') => {
    if (!editingMemberId) return;
    setMemberMemoryError(null);
    try {
      await convexRepository.unlockMemberMemory({ memberId: editingMemberId, kind });
      const bundle = await convexRepository.getMemberMemoryBundle(editingMemberId);
      setMemberMemoryBundle(bundle);
    } catch (error) {
      setMemberMemoryError(error instanceof Error ? error.message : 'Could not unlock member memory.');
    }
  };

  const regenerateMemberMemory = async (kind: 'interaction_policy' | 'mental_model') => {
    await unlockMemberMemory(kind);
    await refreshMemberMemory(true);
  };

  const saveEpisode = async (episodeId: string) => {
    const episode = memberMemoryBundle?.episodes.find((item) => item.id === episodeId);
    if (!episode) return;
    setMemberMemoryError(null);
    try {
      const updated = await convexRepository.updateMemberMemoryEpisode({
        episodeId,
        title: episode.title,
        body: episode.body,
      });
      if (!updated) return;
      setMemberMemoryBundle((current) => current
        ? { ...current, episodes: current.episodes.map((item) => (item.id === episodeId ? updated : item)) }
        : current);
    } catch (error) {
      setMemberMemoryError(error instanceof Error ? error.message : 'Could not save episode.');
    }
  };

  const toggleEpisodeArchive = async (episodeId: string, archived: boolean) => {
    setMemberMemoryError(null);
    try {
      await convexRepository.updateMemberMemoryEpisode({
        episodeId,
        archivedAt: archived ? null : Date.now(),
      });
      if (!editingMemberId) return;
      const bundle = await convexRepository.getMemberMemoryBundle(editingMemberId);
      setMemberMemoryBundle(bundle);
    } catch (error) {
      setMemberMemoryError(error instanceof Error ? error.message : 'Could not update episode.');
    }
  };

  const normalizeDocKey = (value?: string) => (value ?? '').trim().toLowerCase();
  const digestByDocumentName = new Map(
    kbDigests
      .filter((digest) => Boolean(digest.kbDocumentName))
      .map((digest) => [normalizeDocKey(digest.kbDocumentName), digest] as const)
  );
  const digestByDisplayName = new Map(
    kbDigests.map((digest) => [normalizeDocKey(digest.displayName), digest] as const)
  );

  const digestForDoc = (doc: { kbDocumentName?: string; displayName?: string }) => {
    const byName = digestByDocumentName.get(normalizeDocKey(doc.kbDocumentName));
    if (byName) return byName;
    return digestByDisplayName.get(normalizeDocKey(doc.displayName ?? doc.kbDocumentName));
  };

  const stageClass = (status: 'pending' | 'running' | 'completed' | 'failed') => {
    if (status === 'completed') return 'border-border bg-muted/40 text-emerald-500';
    if (status === 'running') return 'border-border bg-muted/40 text-sky-400';
    if (status === 'failed') return 'border-border bg-muted/40 text-destructive';
    return 'border-border bg-muted/40 text-muted-foreground';
  };

  const getDocChunkConfig = (kbDocumentId: string, fallback: KbChunkConfig): KbChunkConfig =>
    docChunkConfigDrafts[kbDocumentId] ?? fallback;

  const updateDocChunkConfig = (
    kbDocumentId: string,
    patch: Partial<KbChunkConfig>,
    fallback: KbChunkConfig,
  ) => {
    setDocChunkConfigDrafts((current) => ({
      ...current,
      [kbDocumentId]: {
        ...getDocChunkConfig(kbDocumentId, fallback),
        ...patch,
      },
    }));
  };

  const toggleArchiveAccess = (key: keyof PersonalArchiveAccess) => {
    setForm((current) => ({
      ...current,
      personalArchiveAccess: {
        ...current.personalArchiveAccess,
        [key]: !current.personalArchiveAccess[key],
      },
    }));
  };

  return (
    <div className="h-full overflow-y-auto px-4 py-5 md:px-8 md:py-8">
      <div className={`mx-auto grid w-full gap-6 ${isFormActive ? 'max-w-6xl lg:grid-cols-[1.2fr_1fr]' : 'max-w-2xl grid-cols-1'}`}>
        <section className={`space-y-4 ${isFormActive ? 'order-2 lg:order-1' : 'order-1'}`}>
          <div className="flex items-center justify-between">
            <h1 className="font-mono text-xl font-semibold tracking-tight">Members</h1>
            <Button variant="outline" className="h-8 gap-2 rounded-md text-xs" onClick={startCreate}>
              <Plus className="h-3.5 w-3.5" />
              New member
            </Button>
          </div>

          <MemberList
            title="Active"
            members={activeMembers}
            kbDocumentsByMember={kbDocumentsByMember}
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
              kbDocumentsByMember={kbDocumentsByMember}
              onEdit={() => { }}
              onArchive={() => { }}
              onCreateChamber={() => Promise.resolve()}
              archived
            />
          ) : null}
        </section>

        {isFormActive && (
          <section className="order-1 rounded-lg border border-border bg-transparent p-4 lg:order-2">
            <h2 className="font-mono text-sm font-semibold tracking-tight">{editingMemberId ? 'Edit member' : 'Create member'}</h2>
            <p className="mt-1 font-mono text-[11px] text-muted-foreground">
              Set member identity and manage knowledge.
            </p>

            <div className="mt-4 space-y-4">
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
                <label className="grid flex-1 gap-1.5 font-mono text-xs">
                  Name
                  <input
                    className="h-9 rounded-md border border-border bg-transparent px-3 text-sm focus-visible:border-foreground focus-visible:outline-none transition-colors"
                    value={form.name}
                    onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                    placeholder="Member name"
                  />
                </label>
              </div>

              <label className="grid gap-1.5 font-mono text-xs">
                <span className="flex items-center justify-between gap-2">
                  <span>Specialties (csv)</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-6 gap-1 rounded-md px-2 text-[10px]"
                    disabled={!form.name.trim() || !form.systemPrompt.trim() || isSuggestingSpecialties}
                    onClick={() => void generateSpecialties()}
                    title="Suggest specialties with AI"
                  >
                    <Sparkles className="h-3 w-3" />
                    {isSuggestingSpecialties ? 'Working…' : 'AI'}
                  </Button>
                </span>
                <input
                  className="h-9 rounded-md border border-border bg-transparent px-3 text-sm focus-visible:border-foreground focus-visible:outline-none transition-colors"
                  value={form.specialties}
                  onChange={(event) => setForm((current) => ({ ...current, specialties: event.target.value }))}
                  placeholder="strategy, execution"
                />
              </label>

              <label className="grid gap-1.5 font-mono text-xs">
                <span className="flex items-center justify-between gap-2">
                  <span>System prompt</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-6 gap-1 rounded-md px-2 text-[10px]"
                    onClick={openPromptDialog}
                    title="Expand system prompt editor"
                  >
                    <Expand className="h-3 w-3" />
                    Expand
                  </Button>
                </span>
                <textarea
                  className="min-h-36 rounded-md border border-border bg-transparent px-3 py-2 text-sm leading-relaxed focus-visible:border-foreground focus-visible:outline-none transition-colors resize-y"
                  value={form.systemPrompt}
                  onChange={(event) => setForm((current) => ({ ...current, systemPrompt: event.target.value }))}
                  placeholder="Direct instructions for this member..."
                />
              </label>

              <label className="grid gap-1.5 font-mono text-xs">
                <span className="flex items-center justify-between gap-2">
                  <span>Guidance profile</span>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-6 gap-1 rounded-md px-2 text-[10px]"
                      onClick={() => void generateGuidance()}
                      disabled={!editingMemberId || isGeneratingGuidance}
                      title="Generate guidance profile"
                    >
                      {isGeneratingGuidance ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                      {isGeneratingGuidance ? 'Working…' : 'Generate'}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-6 gap-1 rounded-md px-2 text-[10px]"
                      onClick={openGuidanceDialog}
                      title="Expand guidance profile editor"
                    >
                      <Expand className="h-3 w-3" />
                      Expand
                    </Button>
                  </div>
                </span>
                <textarea
                  className="min-h-32 rounded-md border border-border bg-transparent px-3 py-2 text-sm leading-relaxed focus-visible:border-foreground focus-visible:outline-none transition-colors resize-y"
                  value={form.guidanceProfilePrompt}
                  onChange={(event) => setForm((current) => ({ ...current, guidanceProfilePrompt: event.target.value }))}
                  placeholder="Generated from the system prompt after save"
                />
                <p className="font-mono text-[10px] text-muted-foreground">
                  {form.guidanceProfilePrompt.trim().length > 0
                    ? 'Guidance profile is editable and will not auto-refresh when the system prompt changes. Press Generate to replace it.'
                    : 'Generated from the system prompt after save. Existing members can generate it manually.'}
                </p>
              </label>

              <label className="grid gap-1.5 font-mono text-xs">
                <span>Chamber response model</span>
                <select
                  className="h-9 rounded-md border border-border bg-transparent px-3 text-sm focus-visible:border-foreground focus-visible:outline-none transition-colors"
                  value={String(form.chatResponseModelSlot)}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      chatResponseModelSlot: Number.parseInt(event.target.value, 10) || 1,
                    }))
                  }
                >
                  {(chatResponseModelSlots.length > 0
                    ? chatResponseModelSlots
                    : [{ slot: 1, envKey: 'AI_MODEL_CHAT_RESPONSE', modelSpec: 'openai:gpt-5.3-chat-latest', isDefault: true }]
                  ).map((slot) => (
                    <option key={slot.slot} value={slot.slot}>
                      {`Slot ${slot.slot}${slot.isDefault ? ' (default / fallback)' : ''} - ${slot.modelSpec}`}
                    </option>
                  ))}
                </select>
                <p className="font-mono text-[10px] text-muted-foreground">
                  This preference applies to chamber replies. Halls assign response models per participant automatically.
                </p>
              </label>

              <label className="grid gap-1.5 font-mono text-xs">
                <span>Speech voice</span>
                <select
                  className="h-9 rounded-md border border-border bg-transparent px-3 text-sm focus-visible:border-foreground focus-visible:outline-none transition-colors"
                  value={form.ttsVoiceName}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, ttsVoiceName: event.target.value as MemberVoiceName }))
                  }
                >
                  {MEMBER_VOICE_OPTIONS.map((voice) => (
                    <option key={voice.value} value={voice.value}>
                      {voice.label} - {voice.family}
                    </option>
                  ))}
                </select>
                <p className="font-mono text-[10px] text-muted-foreground">
                  {describeMemberVoice(form.ttsVoiceName)}
                </p>
              </label>

              <label className="grid gap-1.5 font-mono text-xs">
                <span className="flex items-center justify-between gap-2">
                  <span>Voice persona</span>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-6 gap-1 rounded-md px-2 text-[10px]"
                      onClick={() => void generateVoicePersona()}
                      disabled={!editingMemberId || isGeneratingVoicePersona}
                      title="Generate voice persona"
                    >
                      {isGeneratingVoicePersona ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                      {isGeneratingVoicePersona ? 'Working…' : 'Generate'}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-6 gap-1 rounded-md px-2 text-[10px]"
                      onClick={openVoicePersonaDialog}
                      title="Expand voice persona editor"
                    >
                      <Expand className="h-3 w-3" />
                      Expand
                    </Button>
                  </div>
                </span>
                <textarea
                  className="min-h-28 rounded-md border border-border bg-transparent px-3 py-2 text-sm leading-relaxed focus-visible:border-foreground focus-visible:outline-none transition-colors resize-y"
                  value={form.ttsPersonaPrompt}
                  onChange={(event) => setForm((current) => ({ ...current, ttsPersonaPrompt: event.target.value }))}
                  placeholder="Generated from the system prompt after save"
                />
                <p className="font-mono text-[10px] text-muted-foreground">
                  Used only for speech delivery. If blank, TTS falls back to the default explanatory persona.
                </p>
              </label>

              <section className="rounded-md border border-border bg-background/50 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      Member Memory
                    </p>
                    <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                      Chamber-only long-term memory for this member. Open the editor to inspect or update the full details.
                    </p>
                  </div>
                </div>

                {memberMemoryError ? (
                  <p className="mt-2 font-mono text-[11px] text-destructive">{memberMemoryError}</p>
                ) : null}

                {!editingMemberId ? (
                  <p className="mt-3 font-mono text-[11px] text-muted-foreground">
                    Save this member first to inspect or edit member memory.
                  </p>
                ) : null}

                {editingMemberId && memberMemoryBundle ? (
                  <div className="mt-4 rounded-md border border-border/70 bg-background/70 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-2">
                        <div className="flex flex-wrap gap-2">
                          <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                            Interaction policy: {memberMemoryBundle.interactionPolicy?.lockedByUser ? 'Locked' : memberMemoryBundle.interactionPolicy ? 'Generated' : 'Empty'}
                          </span>
                          <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                            Mental model: {memberMemoryBundle.mentalModel?.lockedByUser ? 'Locked' : memberMemoryBundle.mentalModel ? 'Generated' : 'Empty'}
                          </span>
                          <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                            Episodes: {memberMemoryBundle.episodes.length}
                          </span>
                        </div>
                        <p className="font-mono text-[10px] text-muted-foreground">
                          Open the modal to inspect, edit, archive, regenerate, or refresh member memory.
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-6 gap-1 rounded-md px-2 text-[10px]"
                          onClick={() => void refreshMemberMemory(true)}
                          disabled={!editingMemberId || isMemberMemoryLoading}
                        >
                          {isMemberMemoryLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCcw className="h-3 w-3" />}
                          Refresh
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-6 gap-1 rounded-md px-2 text-[10px]"
                          onClick={() => setIsMemberMemoryDialogOpen(true)}
                        >
                          <Expand className="h-3 w-3" />
                          Open
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : null}
              </section>

              <section className="rounded-md border border-border bg-background/50 p-3">
                <div className="mb-2">
                  <p className="font-mono text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Personal Archive Access
                  </p>
                  <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                    Identity is always on. These toggles control searchable archive buckets for this member.
                  </p>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {[
                    ['reflection', 'Reflection'],
                    ['cookieJar', 'Cookie Jar'],
                    ['accountability', 'Accountability'],
                    ['worldModel', 'World Model'],
                  ].map(([key, label]) => {
                    const typedKey = key as keyof PersonalArchiveAccess;
                    const enabled = form.personalArchiveAccess[typedKey];
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => toggleArchiveAccess(typedKey)}
                        className={`flex items-center justify-between rounded-md border px-3 py-2 text-left font-mono text-xs transition-colors ${
                          enabled
                            ? 'border-foreground/30 bg-foreground text-background'
                            : 'border-border bg-transparent text-foreground hover:border-foreground/20 hover:bg-muted/40'
                        }`}
                      >
                        <span>{label}</span>
                        <span className="text-[10px] uppercase tracking-[0.14em]">
                          {enabled ? 'On' : 'Off'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>

              <div className="mt-2 flex items-center gap-2">
                <Button className="h-8 gap-2 rounded-md text-xs" onClick={() => void save()} disabled={!form.name.trim() || !form.systemPrompt.trim()}>
                  <Save className="h-3.5 w-3.5" />
                  Save
                </Button>
                <Button variant="ghost" className="h-8 rounded-md text-xs" onClick={resetForm}>
                  Cancel
                </Button>
              </div>

              {showKbPanel ? (
                <section className="mt-4 rounded-md border border-border bg-background p-4">
                  <div className="mb-4 flex items-center justify-between gap-2">
                    <div>
                      <p className="font-mono text-sm font-semibold">Knowledge base</p>
                      <p className="font-mono text-[10px] text-muted-foreground mt-0.5">
                        Track upload, chunking, indexing, and metadata per document.
                      </p>
                    </div>
                    <label
                      className={`inline-flex items-center gap-1.5 rounded-md border border-border bg-transparent px-2.5 py-1.5 font-mono text-xs transition-colors ${editingMemberId ? 'cursor-pointer hover:border-foreground/20 hover:bg-muted/40' : 'cursor-not-allowed opacity-50'
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

                  {editingMemberId ? (
                    <div className="mb-4 rounded-md border border-border/70 bg-muted/20 p-3">
                      <p className="font-mono text-[11px] font-semibold">Upload chunking defaults</p>
                      <div className="mt-2 grid gap-2 md:grid-cols-3">
                        <label className="grid gap-1 text-[11px]">
                          Preset
                          <select
                            className="h-9 rounded-md border border-border bg-background px-2"
                            value={detectKbChunkPreset(uploadChunkConfig)}
                            onChange={(event) => {
                              const preset = event.target.value;
                              if (preset === 'custom') return;
                              setUploadChunkConfig(getKbChunkPresetConfig(preset as 'small' | 'default' | 'large'));
                            }}
                          >
                            <option value="small">Small</option>
                            <option value="default">Default</option>
                            <option value="large">Large</option>
                            <option value="custom">Custom</option>
                          </select>
                        </label>
                        <label className="grid gap-1 text-[11px]">
                          Chunk size
                          <input
                            type="number"
                            min={200}
                            max={12000}
                            className="h-9 rounded-md border border-border bg-background px-3"
                            value={uploadChunkConfig.chunkSizeChars}
                            onChange={(event) =>
                              setUploadChunkConfig((current) => ({
                                ...current,
                                chunkSizeChars: Number(event.target.value) || 0,
                              }))
                            }
                          />
                        </label>
                        <label className="grid gap-1 text-[11px]">
                          Overlap
                          <input
                            type="number"
                            min={0}
                            max={4000}
                            className="h-9 rounded-md border border-border bg-background px-3"
                            value={uploadChunkConfig.chunkOverlapChars}
                            onChange={(event) =>
                              setUploadChunkConfig((current) => ({
                                ...current,
                                chunkOverlapChars: Number(event.target.value) || 0,
                              }))
                            }
                          />
                        </label>
                      </div>
                    </div>
                  ) : null}

                  {!editingMemberId ? (
                    <p className="mb-2 text-xs text-muted-foreground">
                      Save this member first, then upload and manage KB documents.
                    </p>
                  ) : null}

                  {editingMemberId && busyMemberId === editingMemberId ? (
                    <p className="text-xs text-muted-foreground">Loading documents...</p>
                  ) : null}

                  {editingUploadProgress.length > 0 ? (
                    <div className="mb-3 space-y-2">
                      {editingUploadProgress.map((entry) => (
                        <div key={entry.localId} className="rounded-md border border-border/70 bg-muted/20 p-2">
                          <div className="mb-1 flex items-center justify-between gap-2">
                            <p className="truncate font-mono text-[11px] font-semibold">{entry.fileName}</p>
                            <p className="font-mono text-[10px] text-muted-foreground">
                              {Math.round(entry.progress * 100)}%
                            </p>
                          </div>
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                            <div className="h-full bg-foreground/80 transition-[width] duration-150" style={{ width: `${Math.round(entry.progress * 100)}%` }} />
                          </div>
                        </div>
                      ))}
                      <p className="text-[11px] text-muted-foreground">
                        Upload in progress. Keep this tab open until uploads finish.
                      </p>
                    </div>
                  ) : null}

                  {editingMemberId && editingDocs.length > 0 ? (
                    <div className="space-y-2">
                      {editingDocs.map((doc, index) => {
                        const key = doc.id ?? `doc-${index}`;
                        const digest = digestForDoc(doc);
                        const isDeleting = Boolean(kbDeletingDocumentIds[doc.id]);
                        const isRetryingIndex = Boolean(kbRetryingIndexDocumentIds[doc.id]);
                        const isRetryingMetadata = Boolean(kbRetryingMetadataDocumentIds[doc.id]);
                        const isReprocessing = Boolean(kbReprocessingDocumentIds[doc.id]);
                        const isDownloading = downloadingKbDocumentId === doc.id;
                        const isProcessing =
                          doc.chunkingStatus === 'pending' ||
                          doc.chunkingStatus === 'running' ||
                          doc.indexingStatus === 'pending' ||
                          doc.indexingStatus === 'running' ||
                          doc.metadataStatus === 'pending' ||
                          doc.metadataStatus === 'running';
                        const docChunkConfig = getDocChunkConfig(doc.id, doc.chunkConfig);
                        return (
                          <article key={key} className="group rounded-md border border-border bg-transparent p-3 transition-colors hover:border-foreground/20">
                            <div className="flex items-center justify-between gap-2">
                              <span className="truncate font-mono text-xs font-semibold">{doc.displayName ?? 'Untitled document'}</span>
                              <div className="flex items-center gap-1 opacity-60 transition-opacity group-hover:opacity-100">
                                {digest ? (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    className="h-6 rounded-md px-2 text-[10px]"
                                    onClick={() => openDigestEditor(digest, doc.id)}
                                  >
                                    Edit metadata
                                  </Button>
                                ) : null}
                                {doc.storageId && doc.indexingStatus === 'failed' ? (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    className="h-6 rounded-md px-2 text-[10px]"
                                    disabled={isRetryingIndex || isDeleting}
                                    onClick={() => void retryIndexing(doc.id)}
                                  >
                                    {isRetryingIndex ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <RefreshCcw className="mr-1 h-3 w-3" />}
                                    Retry indexing
                                  </Button>
                                ) : null}
                                {doc.storageId && doc.metadataStatus === 'failed' ? (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    className="h-6 rounded-md px-2 text-[10px]"
                                    disabled={isRetryingMetadata || isDeleting}
                                    onClick={() => void retryMetadata(doc.id)}
                                  >
                                    {isRetryingMetadata ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <RefreshCcw className="mr-1 h-3 w-3" />}
                                    Retry metadata
                                  </Button>
                                ) : null}
                                {doc.id && doc.storageId ? (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    className="h-6 rounded-md px-2 text-[10px]"
                                    disabled={isDeleting || isDownloading || isProcessing || isReprocessing}
                                    onClick={() => void reprocessDocument(doc.id)}
                                  >
                                    {isReprocessing ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <RefreshCcw className="mr-1 h-3 w-3" />}
                                    {isReprocessing ? 'Reprocessing…' : 'Reprocess'}
                                  </Button>
                                ) : null}
                                {doc.id && doc.storageId ? (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    disabled={isDeleting || isDownloading}
                                    onClick={() => void downloadDocument(doc.id, doc.displayName)}
                                    title="Download document"
                                  >
                                    {isDownloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                                  </Button>
                                ) : null}
                                {doc.id && doc.storageId ? (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    disabled={isDeleting || isDownloading}
                                    onClick={() => void deleteDocument(doc.id)}
                                    title="Delete document"
                                  >
                                    {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                                  </Button>
                                ) : null}
                              </div>
                            </div>

                            <div className="mt-3 border-t border-border pt-2">
                              <div className="mb-2 flex flex-wrap items-center gap-1.5">
                                <span className={`rounded border px-1.5 py-0.5 font-mono text-[10px] ${stageClass(doc.chunkingStatus)}`}>
                                  Chunking: {doc.chunkingStatus}
                                </span>
                                <span className={`rounded border px-1.5 py-0.5 font-mono text-[10px] ${stageClass(doc.indexingStatus)}`}>
                                  Indexing: {doc.indexingStatus}
                                </span>
                                <span className={`rounded border px-1.5 py-0.5 font-mono text-[10px] ${stageClass(doc.metadataStatus)}`}>
                                  Metadata: {doc.metadataStatus}
                                </span>
                              </div>
                              {doc.ingestErrorIndexing ? (
                                <p className="mt-1 text-[11px] text-destructive">Indexing error: {doc.ingestErrorIndexing}</p>
                              ) : null}
                              {doc.ingestErrorMetadata ? (
                                <p className="mt-1 text-[11px] text-destructive">Metadata error: {doc.ingestErrorMetadata}</p>
                              ) : null}
                              {doc.id && doc.storageId ? (
                                <div className="mt-3 rounded-md border border-border/70 bg-muted/20 p-2">
                                  <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                                    Chunking config
                                  </p>
                                  <div className="mt-2 grid gap-2 md:grid-cols-[120px_1fr_1fr]">
                                    <label className="grid gap-1 text-[11px]">
                                      Preset
                                      <select
                                        className="h-8 rounded-md border border-border bg-background px-2"
                                        value={detectKbChunkPreset(docChunkConfig)}
                                        onChange={(event) => {
                                          const preset = event.target.value;
                                          if (preset === 'custom') return;
                                          updateDocChunkConfig(
                                            doc.id,
                                            getKbChunkPresetConfig(preset as 'small' | 'default' | 'large'),
                                            doc.chunkConfig,
                                          );
                                        }}
                                        disabled={isDeleting || isDownloading || isProcessing || isReprocessing}
                                      >
                                        <option value="small">Small</option>
                                        <option value="default">Default</option>
                                        <option value="large">Large</option>
                                        <option value="custom">Custom</option>
                                      </select>
                                    </label>
                                    <label className="grid gap-1 text-[11px]">
                                      Chunk size
                                      <input
                                        type="number"
                                        min={200}
                                        max={12000}
                                        className="h-8 rounded-md border border-border bg-background px-2"
                                        value={docChunkConfig.chunkSizeChars}
                                        onChange={(event) =>
                                          updateDocChunkConfig(
                                            doc.id,
                                            { chunkSizeChars: Number(event.target.value) || 0 },
                                            doc.chunkConfig,
                                          )
                                        }
                                        disabled={isDeleting || isDownloading || isProcessing || isReprocessing}
                                      />
                                    </label>
                                    <label className="grid gap-1 text-[11px]">
                                      Overlap
                                      <input
                                        type="number"
                                        min={0}
                                        max={4000}
                                        className="h-8 rounded-md border border-border bg-background px-2"
                                        value={docChunkConfig.chunkOverlapChars}
                                        onChange={(event) =>
                                          updateDocChunkConfig(
                                            doc.id,
                                            { chunkOverlapChars: Number(event.target.value) || 0 },
                                            doc.chunkConfig,
                                          )
                                        }
                                        disabled={isDeleting || isDownloading || isProcessing || isReprocessing}
                                      />
                                    </label>
                                  </div>
                                </div>
                              ) : null}
                              {digest ? (
                                <>
                                  <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                                    {digest.documentCard.docType || 'other'}
                                  </p>
                                  {digest.documentCard.about ? (
                                    <p className="mt-1 font-mono text-[10px] text-muted-foreground">{digest.documentCard.about}</p>
                                  ) : null}
                                </>
                              ) : isDigestLoading ? (
                                <p className="text-[11px] text-muted-foreground">Metadata syncing…</p>
                              ) : (
                                <p className="text-[11px] text-muted-foreground">No digest metadata yet for this document.</p>
                              )}
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      {editingMemberId ? 'No documents yet. Upload files to add knowledge.' : 'Document upload becomes available after first save.'}
                    </p>
                  )}

                  {editingMemberId && digestLoadError ? (
                    <p className="mt-2 text-xs text-destructive">{digestLoadError}</p>
                  ) : null}
                  {kbPanelError ? <p className="mt-2 text-xs text-destructive">{kbPanelError}</p> : null}
                </section>
              ) : null}
            </div>

            <DialogPrimitive.Root
              open={isPromptDialogOpen}
              onOpenChange={(open) => {
                setIsPromptDialogOpen(open);
              }}
            >
              <DialogPrimitive.Portal>
                <DialogPrimitive.Overlay className="fixed inset-0 z-[80] bg-background/80" />
                <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-[81] flex h-[min(86vh,820px)] w-[min(95vw,920px)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg border border-border bg-background p-4 shadow-lg focus:outline-none md:p-5">
                  <DialogPrimitive.Title className="font-mono text-lg font-semibold tracking-tight">Edit system prompt</DialogPrimitive.Title>
                  <DialogPrimitive.Description className="mt-1 font-mono text-[11px] text-muted-foreground">
                    Review and update the full prompt in a larger editor.
                  </DialogPrimitive.Description>
                  <textarea
                    className="mt-4 min-h-0 flex-1 resize-none overflow-y-auto rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    value={promptDialogValue}
                    onChange={(event) => setPromptDialogValue(event.target.value)}
                    placeholder="How should this member think and respond?"
                  />
                  <div className="mt-4 flex items-center gap-2">
                    <Button type="button" className="h-8 gap-2 rounded-md text-xs" onClick={savePromptDialog}>
                      <Save className="h-3.5 w-3.5" />
                      Save changes
                    </Button>
                    <DialogPrimitive.Close asChild>
                      <Button type="button" variant="ghost" className="h-8 rounded-md text-xs">
                        Cancel
                      </Button>
                    </DialogPrimitive.Close>
                  </div>
                </DialogPrimitive.Content>
              </DialogPrimitive.Portal>
            </DialogPrimitive.Root>

            <DialogPrimitive.Root
              open={isGuidanceDialogOpen}
              onOpenChange={(open) => {
                setIsGuidanceDialogOpen(open);
              }}
            >
              <DialogPrimitive.Portal>
                <DialogPrimitive.Overlay className="fixed inset-0 z-[80] bg-background/80" />
                <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-[81] flex h-[min(86vh,820px)] w-[min(95vw,920px)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg border border-border bg-background p-4 shadow-lg focus:outline-none md:p-5">
                  <DialogPrimitive.Title className="font-mono text-lg font-semibold tracking-tight">Edit guidance profile</DialogPrimitive.Title>
                  <DialogPrimitive.Description className="mt-1 font-mono text-[11px] text-muted-foreground">
                    Private member guidance used for background calibration and short-lived directives.
                  </DialogPrimitive.Description>
                  <textarea
                    className="mt-4 min-h-0 flex-1 resize-none overflow-y-auto rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    value={guidanceDialogValue}
                    onChange={(event) => setGuidanceDialogValue(event.target.value)}
                    placeholder="Generated from the system prompt after save"
                  />
                  <div className="mt-4 flex items-center gap-2">
                    <Button type="button" className="h-8 gap-2 rounded-md text-xs" onClick={saveGuidanceDialog}>
                      <Save className="h-3.5 w-3.5" />
                      Save changes
                    </Button>
                    <DialogPrimitive.Close asChild>
                      <Button type="button" variant="ghost" className="h-8 rounded-md text-xs">
                        Cancel
                      </Button>
                    </DialogPrimitive.Close>
                  </div>
                </DialogPrimitive.Content>
              </DialogPrimitive.Portal>
            </DialogPrimitive.Root>

            <DialogPrimitive.Root
              open={isVoicePersonaDialogOpen}
              onOpenChange={(open) => {
                setIsVoicePersonaDialogOpen(open);
              }}
            >
              <DialogPrimitive.Portal>
                <DialogPrimitive.Overlay className="fixed inset-0 z-[80] bg-background/80" />
                <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-[81] flex h-[min(86vh,820px)] w-[min(95vw,920px)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg border border-border bg-background p-4 shadow-lg focus:outline-none md:p-5">
                  <DialogPrimitive.Title className="font-mono text-lg font-semibold tracking-tight">Edit voice persona</DialogPrimitive.Title>
                  <DialogPrimitive.Description className="mt-1 font-mono text-[11px] text-muted-foreground">
                    Private TTS-only prompt that shapes pacing, tone, and delivery for this member.
                  </DialogPrimitive.Description>
                  <textarea
                    className="mt-4 min-h-0 flex-1 resize-none overflow-y-auto rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    value={voicePersonaDialogValue}
                    onChange={(event) => setVoicePersonaDialogValue(event.target.value)}
                    placeholder="Generated from the system prompt after save"
                  />
                  <div className="mt-4 flex items-center gap-2">
                    <Button type="button" className="h-8 gap-2 rounded-md text-xs" onClick={saveVoicePersonaDialog}>
                      <Save className="h-3.5 w-3.5" />
                      Save changes
                    </Button>
                    <DialogPrimitive.Close asChild>
                      <Button type="button" variant="ghost" className="h-8 rounded-md text-xs">
                        Cancel
                      </Button>
                    </DialogPrimitive.Close>
                  </div>
                </DialogPrimitive.Content>
              </DialogPrimitive.Portal>
            </DialogPrimitive.Root>

            <DialogPrimitive.Root
              open={isMemberMemoryDialogOpen}
              onOpenChange={(open) => {
                setIsMemberMemoryDialogOpen(open);
                if (!open) {
                  setExpandedMemberMemoryEditor(null);
                }
              }}
            >
              <DialogPrimitive.Portal>
                <DialogPrimitive.Overlay className="fixed inset-0 z-[80] bg-background/80" />
                <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-[81] flex h-[min(90vh,860px)] w-[min(95vw,980px)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg border border-border bg-background p-4 shadow-lg focus:outline-none md:p-5">
                  <DialogPrimitive.Title className="font-mono text-lg font-semibold tracking-tight">Member memory</DialogPrimitive.Title>
                  <DialogPrimitive.Description className="mt-1 font-mono text-[11px] text-muted-foreground">
                    Chamber-only long-term memory for this member. Manual edits lock documents until you unlock or regenerate.
                  </DialogPrimitive.Description>

                  <div className="mt-4 flex items-center justify-between gap-3">
                    <div className="flex flex-wrap gap-2">
                      <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                        Interaction policy: {memberMemoryBundle?.interactionPolicy?.lockedByUser ? 'Locked' : memberMemoryBundle?.interactionPolicy ? 'Generated' : 'Empty'}
                      </span>
                      <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                        Mental model: {memberMemoryBundle?.mentalModel?.lockedByUser ? 'Locked' : memberMemoryBundle?.mentalModel ? 'Generated' : 'Empty'}
                      </span>
                      <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                        Episodes: {memberMemoryBundle?.episodes.length ?? 0}
                      </span>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 gap-2 rounded-md text-xs"
                      onClick={() => void refreshMemberMemory(true)}
                      disabled={!editingMemberId || isMemberMemoryLoading}
                    >
                      {isMemberMemoryLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="h-3.5 w-3.5" />}
                      {isMemberMemoryLoading ? 'Refreshing…' : 'Refresh now'}
                    </Button>
                  </div>

                  {memberMemoryError ? (
                    <p className="mt-3 font-mono text-[11px] text-destructive">{memberMemoryError}</p>
                  ) : null}

                  {memberMemoryBundle ? (
                    <TooltipProvider>
                      <div className="mt-4 min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
                      <div className="rounded-md border border-border/70 bg-background/70 p-3">
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-1.5">
                              <MemoryInfoHint description="How this member should answer this user over time. It is generated from cross-thread chat history with this member, explicit feedback, refine actions like shorter or deep dive, and response-pattern signals. It focuses on stable answering habits such as tone, directness, depth, and pacing." />
                              <p className="font-mono text-xs font-semibold">Interaction policy</p>
                            </div>
                            <p className="font-mono text-[10px] text-muted-foreground">
                              {memberMemoryBundle.interactionPolicy?.lockedByUser ? 'Locked' : 'Generated'}
                            </p>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-6 rounded-md px-2 text-[10px]"
                              onClick={() => setExpandedMemberMemoryEditor('interaction_policy')}
                            >
                              <Expand className="mr-1 h-3 w-3" />
                              Expand
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-6 rounded-md px-2 text-[10px]"
                              onClick={() => void unlockMemberMemory('interaction_policy')}
                              disabled={!memberMemoryBundle.interactionPolicy?.lockedByUser}
                            >
                              Unlock
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-6 rounded-md px-2 text-[10px]"
                              onClick={() => void regenerateMemberMemory('interaction_policy')}
                            >
                              Regenerate
                            </Button>
                          </div>
                        </div>
                        <textarea
                          className="min-h-28 w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm leading-relaxed focus-visible:border-foreground focus-visible:outline-none transition-colors resize-y"
                          value={memberMemoryBundle.interactionPolicy?.body ?? ''}
                          onChange={(event) => updateMemberMemoryDocumentBody('interaction_policy', event.target.value)}
                          placeholder="No interaction policy yet."
                        />
                        <div className="mt-2 flex justify-end">
                          <Button type="button" size="sm" className="h-7 gap-1 rounded-md text-[10px]" onClick={() => void saveInteractionPolicy()}>
                            <Save className="h-3 w-3" />
                            Save
                          </Button>
                        </div>
                      </div>

                      <div className="rounded-md border border-border/70 bg-background/70 p-3">
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-1.5">
                              <MemoryInfoHint description="This member's current understanding of the user. It is generated from the member's chamber history with this user, guidance profile, feedback, and repeated conversational patterns. It captures goals, preferences, sticking points, and what tends to click from this member's point of view." />
                              <p className="font-mono text-xs font-semibold">Mental model</p>
                            </div>
                            <p className="font-mono text-[10px] text-muted-foreground">
                              {memberMemoryBundle.mentalModel?.lockedByUser ? 'Locked' : 'Generated'}
                            </p>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-6 rounded-md px-2 text-[10px]"
                              onClick={() => setExpandedMemberMemoryEditor('mental_model')}
                            >
                              <Expand className="mr-1 h-3 w-3" />
                              Expand
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-6 rounded-md px-2 text-[10px]"
                              onClick={() => void unlockMemberMemory('mental_model')}
                              disabled={!memberMemoryBundle.mentalModel?.lockedByUser}
                            >
                              Unlock
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-6 rounded-md px-2 text-[10px]"
                              onClick={() => void regenerateMemberMemory('mental_model')}
                            >
                              Regenerate
                            </Button>
                          </div>
                        </div>
                        <textarea
                          className="min-h-32 w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm leading-relaxed focus-visible:border-foreground focus-visible:outline-none transition-colors resize-y"
                          value={memberMemoryBundle.mentalModel?.body ?? ''}
                          onChange={(event) => updateMemberMemoryDocumentBody('mental_model', event.target.value)}
                          placeholder="No mental model yet."
                        />
                        <div className="mt-2 flex justify-end">
                          <Button type="button" size="sm" className="h-7 gap-1 rounded-md text-[10px]" onClick={() => void saveMentalModel()}>
                            <Save className="h-3 w-3" />
                            Save
                          </Button>
                        </div>
                      </div>

                      <div className="rounded-md border border-border/70 bg-background/70 p-3">
                        <div className="mb-2">
                          <div className="flex items-center gap-1.5">
                            <MemoryInfoHint description="Specific remembered examples from past chats with this member. Episodes are generated when there is enough history and the system can identify concrete moments that worked, failed, or taught something useful about how this member should respond to the user." />
                            <p className="font-mono text-xs font-semibold">Episodes</p>
                          </div>
                          <p className="font-mono text-[10px] text-muted-foreground">
                            Editable member-specific episodic memories. Manual edits lock the episode.
                          </p>
                        </div>
                        <div className="space-y-3">
                          {memberMemoryBundle.episodes.length === 0 ? (
                            <p className="font-mono text-[11px] text-muted-foreground">No episodes yet.</p>
                          ) : (
                            memberMemoryBundle.episodes.map((episode) => (
                              <div key={episode.id} className="rounded-md border border-border bg-background/60 p-3">
                                <div className="mb-2 flex items-center justify-between gap-2">
                                  <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                                    {episode.lockedByUser ? 'Locked' : 'Generated'}
                                  </p>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    className="h-6 rounded-md px-2 text-[10px]"
                                    onClick={() => void toggleEpisodeArchive(episode.id, Boolean(episode.archivedAt))}
                                  >
                                    {episode.archivedAt ? 'Restore' : 'Archive'}
                                  </Button>
                                </div>
                                <input
                                  className="mb-2 h-9 w-full rounded-md border border-border bg-transparent px-3 text-sm focus-visible:border-foreground focus-visible:outline-none transition-colors"
                                  value={episode.title ?? ''}
                                  onChange={(event) =>
                                    setMemberMemoryBundle((current) =>
                                      current
                                        ? {
                                            ...current,
                                            episodes: current.episodes.map((item) =>
                                              item.id === episode.id ? { ...item, title: event.target.value } : item
                                            ),
                                          }
                                        : current
                                    )
                                  }
                                  placeholder="Episode title"
                                />
                                <textarea
                                  className="min-h-24 w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm leading-relaxed focus-visible:border-foreground focus-visible:outline-none transition-colors resize-y"
                                  value={episode.body}
                                  onChange={(event) =>
                                    setMemberMemoryBundle((current) =>
                                      current
                                        ? {
                                            ...current,
                                            episodes: current.episodes.map((item) =>
                                              item.id === episode.id ? { ...item, body: event.target.value } : item
                                            ),
                                          }
                                        : current
                                    )
                                  }
                                  placeholder="Episode body"
                                />
                                <div className="mt-2 flex justify-end">
                                  <Button type="button" size="sm" className="h-7 gap-1 rounded-md text-[10px]" onClick={() => void saveEpisode(episode.id)}>
                                    <Save className="h-3 w-3" />
                                    Save
                                  </Button>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                      </div>
                    </TooltipProvider>
                  ) : (
                    <div className="mt-4 min-h-0 flex-1">
                      <p className="font-mono text-[11px] text-muted-foreground">No member memory loaded yet.</p>
                    </div>
                  )}

                  <div className="mt-4 flex items-center gap-2">
                    <DialogPrimitive.Close asChild>
                      <Button type="button" variant="ghost" className="h-8 rounded-md text-xs">
                        Close
                      </Button>
                    </DialogPrimitive.Close>
                  </div>
                </DialogPrimitive.Content>
              </DialogPrimitive.Portal>
            </DialogPrimitive.Root>

            <DialogPrimitive.Root
              open={expandedMemberMemoryEditor !== null}
              onOpenChange={(open) => {
                if (!open) {
                  setExpandedMemberMemoryEditor(null);
                }
              }}
            >
              <DialogPrimitive.Portal>
                <DialogPrimitive.Overlay className="fixed inset-0 z-[82] bg-background/80" />
                <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-[83] flex h-[min(88vh,820px)] w-[min(95vw,920px)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg border border-border bg-background p-4 shadow-lg focus:outline-none md:p-5">
                  <DialogPrimitive.Title className="font-mono text-lg font-semibold tracking-tight">
                    {expandedMemberMemoryEditor === 'interaction_policy' ? 'Edit interaction policy' : 'Edit mental model'}
                  </DialogPrimitive.Title>
                  <DialogPrimitive.Description className="mt-1 font-mono text-[11px] text-muted-foreground">
                    Review and edit the full document in a larger editor.
                  </DialogPrimitive.Description>

                  <textarea
                    className="mt-4 min-h-0 flex-1 resize-none overflow-y-auto rounded-lg border border-border bg-background px-3 py-2 text-sm leading-relaxed"
                    value={
                      expandedMemberMemoryEditor === 'interaction_policy'
                        ? memberMemoryBundle?.interactionPolicy?.body ?? ''
                        : memberMemoryBundle?.mentalModel?.body ?? ''
                    }
                    onChange={(event) => {
                      if (!expandedMemberMemoryEditor) return;
                      updateMemberMemoryDocumentBody(expandedMemberMemoryEditor, event.target.value);
                    }}
                    placeholder={
                      expandedMemberMemoryEditor === 'interaction_policy'
                        ? 'No interaction policy yet.'
                        : 'No mental model yet.'
                    }
                  />

                  <div className="mt-4 flex items-center gap-2">
                    <Button
                      type="button"
                      className="h-8 gap-2 rounded-md text-xs"
                      onClick={() => void (
                        expandedMemberMemoryEditor === 'interaction_policy'
                          ? saveInteractionPolicy()
                          : saveMentalModel()
                      )}
                    >
                      <Save className="h-3.5 w-3.5" />
                      Save changes
                    </Button>
                    <DialogPrimitive.Close asChild>
                      <Button type="button" variant="ghost" className="h-8 rounded-md text-xs">
                        Close
                      </Button>
                    </DialogPrimitive.Close>
                  </div>
                </DialogPrimitive.Content>
              </DialogPrimitive.Portal>
            </DialogPrimitive.Root>

            <DialogPrimitive.Root open={isDigestEditorOpen} onOpenChange={setIsDigestEditorOpen}>
              <DialogPrimitive.Portal>
                <DialogPrimitive.Overlay className="fixed inset-0 z-[80] bg-background/80" />
                <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-[81] flex h-[min(90vh,860px)] w-[min(95vw,960px)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg border border-border bg-background p-4 shadow-lg focus:outline-none md:p-5">
                  <DialogPrimitive.Title className="font-mono text-lg font-semibold tracking-tight">Edit KB metadata</DialogPrimitive.Title>
                  <DialogPrimitive.Description className="mt-1 font-mono text-[11px] text-muted-foreground">
                    Adjust retrieval hints saved for this document.
                  </DialogPrimitive.Description>

                  {digestEditor ? (
                    <div className="mt-4 min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
                      <label className="grid gap-1 text-sm">
                        Display name
                        <input
                          className="h-10 rounded-lg border border-border bg-background px-3"
                          value={digestEditor.displayName}
                          onChange={(event) =>
                            setDigestEditor((current) => (current ? { ...current, displayName: event.target.value } : current))
                          }
                        />
                      </label>
                      <label className="grid gap-1 text-sm">
                        Document type
                        <input
                          className="h-10 rounded-lg border border-border bg-background px-3"
                          value={digestEditor.docType}
                          onChange={(event) =>
                            setDigestEditor((current) => (current ? { ...current, docType: event.target.value } : current))
                          }
                        />
                      </label>
                      <label className="grid gap-1 text-sm">
                        Document card
                        <textarea
                          className="min-h-28 rounded-lg border border-border bg-background px-3 py-2"
                          value={digestEditor.about}
                          onChange={(event) =>
                            setDigestEditor((current) => (current ? { ...current, about: event.target.value } : current))
                          }
                        />
                      </label>
                      <label className="grid gap-1 text-sm">
                        Best for questions (comma-separated)
                        <input
                          className="h-10 rounded-lg border border-border bg-background px-3"
                          value={digestEditor.bestFor}
                          onChange={(event) =>
                            setDigestEditor((current) => (current ? { ...current, bestFor: event.target.value } : current))
                          }
                        />
                      </label>
                      <label className="grid gap-1 text-sm">
                        Evidence kinds (comma-separated)
                        <input
                          className="h-10 rounded-lg border border-border bg-background px-3"
                          value={digestEditor.evidenceKinds}
                          onChange={(event) =>
                            setDigestEditor((current) => (current ? { ...current, evidenceKinds: event.target.value } : current))
                          }
                        />
                      </label>
                      <label className="grid gap-1 text-sm">
                        Not for (comma-separated)
                        <input
                          className="h-10 rounded-lg border border-border bg-background px-3"
                          value={digestEditor.notFor}
                          onChange={(event) =>
                            setDigestEditor((current) => (current ? { ...current, notFor: event.target.value } : current))
                          }
                        />
                      </label>
                      <label className="grid gap-1 text-sm">
                        Query hints (comma-separated)
                        <textarea
                          className="min-h-28 rounded-lg border border-border bg-background px-3 py-2"
                          value={digestEditor.queryHints}
                          onChange={(event) =>
                            setDigestEditor((current) => (current ? { ...current, queryHints: event.target.value } : current))
                          }
                        />
                      </label>
                    </div>
                  ) : null}

                  <div className="mt-4 flex items-center gap-2">
                    <Button
                      type="button"
                      className="h-8 gap-2 rounded-md text-xs"
                      disabled={isSavingDigest || isRetryingDigestFromEditor}
                      onClick={() => void saveDigestEditor()}
                    >
                      <Save className="h-3.5 w-3.5" />
                      {isSavingDigest ? 'Saving…' : 'Save metadata'}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-8 gap-2 rounded-md text-xs"
                      disabled={!digestEditor?.kbDocumentId || isSavingDigest || isRetryingDigestFromEditor}
                      onClick={() => void retryDigestEditorMetadata()}
                    >
                      <RefreshCcw className={`h-3.5 w-3.5 ${isRetryingDigestFromEditor ? 'animate-spin' : ''}`} />
                      {isRetryingDigestFromEditor ? 'Retrying…' : 'Retry metadata'}
                    </Button>
                    <DialogPrimitive.Close asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-8 rounded-md text-xs"
                        disabled={isSavingDigest || isRetryingDigestFromEditor}
                      >
                        Cancel
                      </Button>
                    </DialogPrimitive.Close>
                  </div>
                </DialogPrimitive.Content>
              </DialogPrimitive.Portal>
            </DialogPrimitive.Root>
          </section>
        )}
      </div>
    </div>
  );
}

function MemoryInfoHint({ description }: { description: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-muted-foreground/70 transition-colors hover:text-foreground"
          aria-label="What is this?"
        >
          <CircleHelp className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" align="start" className="max-w-80 text-xs leading-relaxed">
        {description}
      </TooltipContent>
    </Tooltip>
  );
}

function MemberList({
  title,
  members,
  kbDocumentsByMember,
  onEdit,
  onArchive,
  onCreateChamber,
  archived = false,
}: {
  title: string;
  members: ReturnType<typeof useAppStore.getState>['members'];
  kbDocumentsByMember: ReturnType<typeof useAppStore.getState>['kbDocumentsByMember'];
  onEdit: (memberId: string) => void;
  onArchive: (memberId: string) => void;
  onCreateChamber: (memberId: string) => Promise<void>;
  archived?: boolean;
}) {
  return (
    <div className="mb-6">
      <h2 className="mb-3 font-mono text-xs font-semibold uppercase tracking-tight text-muted-foreground">{title}</h2>
      <div className="grid gap-2">
        {members.map((member) => (
          <article key={member.id} className="group relative rounded-md border border-border bg-transparent p-3 transition-colors hover:border-foreground/20">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted">
                {member.avatarUrl
                  ? <img src={member.avatarUrl} alt={member.name} className="h-full w-full object-cover" />
                  : <UserCircle2 className="h-5 w-5 text-muted-foreground/50" />
                }
              </div>
              <div className="flex-1">
                <p className="font-mono text-sm font-semibold">{member.name}</p>
                {member.specialties.length > 0 ? (
                  <p className="mt-0.5 text-xs text-muted-foreground">{member.specialties.join(' · ')}</p>
                ) : null}
              </div>

              {!archived ? (
                <div className="flex items-center gap-1 opacity-50 transition-opacity group-hover:opacity-100">
                  <Button variant="ghost" size="icon" className="h-7 w-7 rounded-md" onClick={() => onEdit(member.id)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 rounded-md" onClick={() => onArchive(member.id)}>
                    <Archive className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : null}
            </div>

            <div className="mt-3 flex items-center gap-3">
              {!archived ? (
                <Button variant="outline" size="sm" className="h-7 gap-1 rounded-md text-xs" onClick={() => void onCreateChamber(member.id)}>
                  <MessageSquarePlus className="h-3 w-3" />
                  New chamber
                </Button>
              ) : null}

              <div className="flex items-center gap-2 font-mono text-[10px] text-muted-foreground">
                <span>Docs ({kbDocumentsByMember[member.id]?.length ?? 0})</span>
              </div>
            </div>
          </article>
        ))}

        {members.length === 0 ? <p className="font-mono text-xs text-muted-foreground">No members yet.</p> : null}
      </div>
    </div>
  );
}
