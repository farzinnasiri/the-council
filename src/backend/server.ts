import 'dotenv/config';
// Also load .env.local (Vite convention) so VITE_CONVEX_URL is available server-side
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local', override: false });
import cors from 'cors';
import express from 'express';
import multer from 'multer';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { GeminiRAGChatbot } from './geminiRag.js';
import { MODEL_IDS, resolveModel } from './modelConfig.js';

const app = express();
const port = Number(process.env.PORT ?? 43111);
const isDev = process.env.NODE_ENV === 'development';
const viteDevPort = Number(process.env.VITE_DEV_PORT ?? 43112);
const upload = multer({ dest: path.join(os.tmpdir(), 'gemini-rag-web') });
const stateDir = path.resolve('.state');
const stateFile = path.join(stateDir, 'knowledge-base.json');
const frontendBuildDir = path.resolve('frontend-dist');
const legacyPublicDir = path.resolve('public');
const staticRoot = fs.existsSync(frontendBuildDir) ? frontendBuildDir : legacyPublicDir;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
if (!isDev) {
  app.use(express.static(staticRoot));
}

const bot = new GeminiRAGChatbot(process.env.GEMINI_API_KEY);
let bootstrapped = false;
let bootstrapping: Promise<void> | null = null;

function readSavedStoreName(): string | null {
  try {
    const raw = fs.readFileSync(stateFile, 'utf8');
    const parsed = JSON.parse(raw) as { storeName?: string };
    return typeof parsed.storeName === 'string' && parsed.storeName.trim() ? parsed.storeName : null;
  } catch {
    return null;
  }
}

function saveStoreName(storeName: string): void {
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(stateFile, JSON.stringify({ storeName }, null, 2));
}

function sanitizeLabel(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 42) || 'member';
}

function hash(input: string): number {
  return Array.from(input).reduce((acc, char) => (acc * 31 + char.charCodeAt(0)) >>> 0, 7);
}

function fallbackRouteMemberIds(message: string, candidates: Array<{ id: string }>, maxSelections = 3): string[] {
  if (candidates.length === 0) {
    return [];
  }
  const seed = hash(message);
  const count = Math.max(1, Math.min(maxSelections, candidates.length));
  const start = seed % candidates.length;
  const selected: string[] = [];
  for (let index = 0; index < count; index += 1) {
    selected.push(candidates[(start + index) % candidates.length].id);
  }
  return selected;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Operation timed out')), timeoutMs);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

async function ensureKnowledgeBase(): Promise<void> {
  if (bootstrapped) {
    return;
  }
  if (bootstrapping) {
    return bootstrapping;
  }

  bootstrapping = (async () => {
    const storeLabel = process.env.FILE_SEARCH_STORE_LABEL ?? 'web-rag-store';
    const explicitStoreName = process.env.FILE_SEARCH_STORE_NAME;
    const savedStoreName = readSavedStoreName();

    let storeName: string;
    if (explicitStoreName && (await bot.connectKnowledgeBaseByName(explicitStoreName))) {
      storeName = explicitStoreName;
    } else if (savedStoreName && (await bot.connectKnowledgeBaseByName(savedStoreName))) {
      storeName = savedStoreName;
    } else {
      const existingByLabel = await bot.findKnowledgeBaseByDisplayName(storeLabel);
      if (existingByLabel && (await bot.connectKnowledgeBaseByName(existingByLabel))) {
        storeName = existingByLabel;
      } else {
        storeName = await bot.createKnowledgeBase(storeLabel);
      }
    }

    saveStoreName(storeName);
    bootstrapped = true;
    console.log(`Knowledge base ready: ${storeName}`);
  })();

  return bootstrapping;
}

app.get('/api/health', async (_req, res) => {
  try {
    await ensureKnowledgeBase();
    res.json({ ok: true, store: bot.getKnowledgeBaseName() });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ ok: false, error: message });
  }
});

app.post('/api/upload', upload.array('documents'), async (req, res) => {
  const files = (req.files as Express.Multer.File[]) ?? [];

  if (files.length === 0) {
    res.status(400).json({ error: 'No files uploaded. Use field name "documents".' });
    return;
  }

  try {
    await ensureKnowledgeBase();
    await Promise.all(
      files.map((file) =>
        bot.uploadDocument(file.path, {
          displayName: file.originalname,
          mimeType: file.mimetype || undefined,
          maxTokensPerChunk: 500,
          maxOverlapTokens: 50,
        })
      )
    );

    const docs = await bot.listDocuments();
    res.json({ uploaded: files.map((f) => f.originalname), documents: docs });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Upload failed';
    res.status(500).json({ error: message });
  } finally {
    for (const file of files) {
      if (fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }
    }
  }
});

app.get('/api/documents', async (_req, res) => {
  try {
    await ensureKnowledgeBase();
    const docs = await bot.listDocuments();
    res.json({ documents: docs });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'List failed';
    res.status(500).json({ error: message });
  }
});

app.post('/api/chat', async (req, res) => {
  const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
  const chatModel = typeof req.body?.chatModel === 'string' ? req.body.chatModel : undefined;
  const retrievalModel = typeof req.body?.retrievalModel === 'string' ? req.body.retrievalModel : undefined;
  const personaPrompt = typeof req.body?.personaPrompt === 'string' ? req.body.personaPrompt : undefined;

  if (!message) {
    res.status(400).json({ error: 'message is required' });
    return;
  }

  try {
    await ensureKnowledgeBase();
    const result = await bot.chat(message, {
      responseModel: resolveModel('chatResponse', chatModel),
      retrievalModel: resolveModel('retrieval', retrievalModel),
      temperature: 0.35,
      personaPrompt: personaPrompt ?? process.env.GEMINI_PERSONA_PROMPT,
    });

    res.json(result);
  } catch (error) {
    const messageText = error instanceof Error ? error.message : 'Chat failed';
    res.status(500).json({ error: messageText });
  }
});

app.post('/api/hall/route', async (req, res) => {
  const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
  const candidates = Array.isArray(req.body?.candidates) ? req.body.candidates : [];
  const maxSelections = Number(req.body?.maxSelections ?? 3);

  if (!message) {
    res.status(400).json({ error: 'message is required' });
    return;
  }

  const normalizedCandidates: Array<{
    id: string;
    name: string;
    specialties: string[];
    systemPrompt?: string;
  }> = [];

  for (const rawCandidate of candidates as unknown[]) {
    const input = (rawCandidate ?? {}) as Record<string, unknown>;
    const specialties =
      typeof input.specialties === 'string'
        ? input.specialties.split(',').map((item) => item.trim()).filter(Boolean)
        : Array.isArray(input.specialties)
          ? input.specialties
              .filter((item: unknown) => typeof item === 'string')
              .map((item: string) => item.trim())
              .filter(Boolean)
          : [];
    const candidate = {
      id: typeof input.id === 'string' ? input.id : '',
      name: typeof input.name === 'string' ? input.name : '',
      specialties,
      systemPrompt: typeof input.systemPrompt === 'string' ? input.systemPrompt : undefined,
    };

    if (candidate.id && candidate.name) {
      normalizedCandidates.push(candidate);
    }
  }

  if (normalizedCandidates.length === 0) {
    res.status(400).json({ error: 'candidates are required' });
    return;
  }

  const timeoutMs = Number(process.env.GEMINI_ROUTER_TIMEOUT_MS ?? 3500);

  try {
    const routed = await withTimeout(
      bot.routeMembersLite({
        message,
        candidates: normalizedCandidates,
        maxSelections,
        model: resolveModel('router'),
      }),
      timeoutMs
    );

    const chosen = routed.chosenMemberIds.filter((id) => normalizedCandidates.some((candidate) => candidate.id === id));
    if (chosen.length === 0) {
      const fallback = fallbackRouteMemberIds(message, normalizedCandidates, maxSelections);
      res.json({ chosenMemberIds: fallback, model: routed.model, source: 'fallback' });
      return;
    }

    res.json({ chosenMemberIds: chosen.slice(0, Math.max(1, maxSelections)), model: routed.model, source: 'llm' });
  } catch {
    const fallback = fallbackRouteMemberIds(message, normalizedCandidates, maxSelections);
    res.json({ chosenMemberIds: fallback, model: MODEL_IDS.router, source: 'fallback' });
  }
});

app.post('/api/member/specialties/suggest', async (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const systemPrompt = typeof req.body?.systemPrompt === 'string' ? req.body.systemPrompt.trim() : '';
  const model = typeof req.body?.model === 'string' ? req.body.model.trim() : undefined;

  if (!name || !systemPrompt) {
    res.status(400).json({ error: 'name and systemPrompt are required' });
    return;
  }

  try {
    const result = await bot.suggestMemberSpecialties({ name, systemPrompt, model });
    res.json(result);
  } catch (error) {
    const messageText = error instanceof Error ? error.message : 'Specialties suggestion failed';
    res.status(500).json({ error: messageText });
  }
});

app.post('/api/hall/title', async (req, res) => {
  const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
  const model = typeof req.body?.model === 'string' ? req.body.model.trim() : undefined;

  if (!message) {
    res.status(400).json({ error: 'message is required' });
    return;
  }

  try {
    const result = await bot.suggestHallTitle({ message, model });
    res.json(result);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Hall title generation failed';
    res.status(500).json({ error: errorMessage });
  }
});

app.post('/api/member-kb/ensure', async (req, res) => {
  const memberId = typeof req.body?.memberId === 'string' ? req.body.memberId : '';
  const memberName = typeof req.body?.memberName === 'string' ? req.body.memberName : '';
  const storeName = typeof req.body?.storeName === 'string' && req.body.storeName.trim() ? req.body.storeName : null;

  if (!memberId || !memberName) {
    res.status(400).json({ error: 'memberId and memberName are required' });
    return;
  }

  try {
    const ensured = await bot.ensureKnowledgeBase({
      storeName,
      displayName: `council-${sanitizeLabel(memberName)}-${memberId.slice(0, 6)}`,
    });

    res.json(ensured);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to ensure member store';
    res.status(500).json({ error: message });
  }
});

app.post('/api/member-kb/upload', upload.array('documents'), async (req, res) => {
  const memberId = typeof req.body?.memberId === 'string' ? req.body.memberId : '';
  const memberName = typeof req.body?.memberName === 'string' ? req.body.memberName : '';
  const storeName = typeof req.body?.storeName === 'string' && req.body.storeName.trim() ? req.body.storeName : null;
  const files = (req.files as Express.Multer.File[]) ?? [];

  if (!memberId || !memberName) {
    res.status(400).json({ error: 'memberId and memberName are required' });
    return;
  }

  if (files.length === 0) {
    res.status(400).json({ error: 'No files uploaded. Use field name "documents".' });
    return;
  }

  try {
    const ensured = await bot.ensureKnowledgeBase({
      storeName,
      displayName: `council-${sanitizeLabel(memberName)}-${memberId.slice(0, 6)}`,
    });

    const existing = await bot.listDocumentsFromStore(ensured.storeName);
    const existingNames = new Set(
      existing
        .map((doc) => (doc.displayName ?? '').trim().toLowerCase())
        .filter(Boolean)
    );

    await Promise.all(
      files.map(async (file) => {
        const normalizedName = file.originalname.trim().toLowerCase();
        if (normalizedName && existingNames.has(normalizedName)) {
          return;
        }

        await bot.uploadDocumentToStore(ensured.storeName, file.path, {
          displayName: file.originalname,
          mimeType: file.mimetype || undefined,
          maxTokensPerChunk: 500,
          maxOverlapTokens: 50,
        });
      })
    );

    const documents = await bot.listDocumentsFromStore(ensured.storeName);
    res.json({ storeName: ensured.storeName, documents });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Upload failed';
    res.status(500).json({ error: message });
  } finally {
    for (const file of files) {
      if (fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }
    }
  }
});

app.get('/api/member-kb/documents', async (req, res) => {
  const storeName = typeof req.query?.storeName === 'string' ? req.query.storeName : '';
  if (!storeName) {
    res.status(400).json({ error: 'storeName is required' });
    return;
  }

  try {
    const documents = await bot.listDocumentsFromStore(storeName);
    res.json({ documents });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'List failed';
    res.status(500).json({ error: message });
  }
});

app.post('/api/member-kb/document/delete', async (req, res) => {
  const documentName = typeof req.body?.documentName === 'string' ? req.body.documentName.trim() : '';
  const storeName = typeof req.body?.storeName === 'string' ? req.body.storeName.trim() : '';

  if (!documentName) {
    res.status(400).json({ error: 'documentName is required' });
    return;
  }

  try {
    await bot.deleteDocumentByName(documentName, true);
    if (storeName) {
      const documents = await bot.listDocumentsFromStore(storeName);
      res.json({ ok: true, documents });
      return;
    }
    res.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Delete failed';
    res.status(500).json({ error: message });
  }
});

// ── Compaction endpoint ────────────────────────────────────────────────────────

app.post('/api/compact', async (req, res) => {
  const conversationId = typeof req.body?.conversationId === 'string' ? req.body.conversationId.trim() : '';
  const previousSummary = typeof req.body?.previousSummary === 'string' ? req.body.previousSummary.trim() : undefined;
  const messageIdsRaw: unknown[] = Array.isArray(req.body?.messageIds) ? req.body.messageIds : [];
  const messageIds = messageIdsRaw.filter((id): id is string => typeof id === 'string');

  const contextMessages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  if (Array.isArray(req.body?.messages)) {
    for (const entry of req.body.messages as unknown[]) {
      const item = (entry ?? {}) as Record<string, unknown>;
      const role = item.role === 'user' || item.role === 'assistant' ? item.role : null;
      const content = typeof item.content === 'string' ? item.content.trim() : '';
      if (role && content) contextMessages.push({ role, content });
    }
  }

  if (!conversationId || contextMessages.length === 0 || messageIds.length === 0) {
    res.status(400).json({ error: 'conversationId, messages, and messageIds are required' });
    return;
  }

  try {
    const summary = await bot.summarizeMessages({ messages: contextMessages, previousSummary });

    res.json({ summary });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Compaction failed';
    res.status(500).json({ error: message });
  }
});

app.post('/api/member-chat', async (req, res) => {
  const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
  const memberId = typeof req.body?.memberId === 'string' ? req.body.memberId : '';
  const memberName = typeof req.body?.memberName === 'string' ? req.body.memberName : '';
  const memberSystemPrompt = typeof req.body?.memberSystemPrompt === 'string' ? req.body.memberSystemPrompt : '';
  const storeName = typeof req.body?.storeName === 'string' && req.body.storeName.trim() ? req.body.storeName : null;
  const previousSummary = typeof req.body?.previousSummary === 'string' && req.body.previousSummary.trim() ? req.body.previousSummary : null;
  const hallContext = typeof req.body?.hallContext === 'string' && req.body.hallContext.trim() ? req.body.hallContext : null;
  const chatModel = typeof req.body?.chatModel === 'string' ? req.body.chatModel : undefined;
  const retrievalModel = typeof req.body?.retrievalModel === 'string' ? req.body.retrievalModel : undefined;
  const contextMessages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  if (Array.isArray(req.body?.contextMessages)) {
    for (const entry of req.body.contextMessages as unknown[]) {
      const item = (entry ?? {}) as Record<string, unknown>;
      const role = item.role === 'user' || item.role === 'assistant' ? item.role : null;
      const content = typeof item.content === 'string' ? item.content.trim() : '';
      if (role && content) {
        contextMessages.push({ role, content });
      }
    }
  }
  const boundedContextMessages = contextMessages.slice(-12);

  // Prepend hall context + member prompt; if there's a rolling summary, inject it after the persona.
  const summaryBlock = previousSummary
    ? `\n\n---\nConversation summary so far:\n${previousSummary}\n---`
    : '';
  const hallBlock = hallContext ? `${hallContext}\n\n` : '';
  const effectiveSystemPrompt = hallBlock + memberSystemPrompt + summaryBlock;

  if (!message || !memberId || !memberName || !memberSystemPrompt.trim()) {
    res.status(400).json({ error: 'message, memberId, memberName, and memberSystemPrompt are required' });
    return;
  }

  try {
    const response = await bot.chatWithOptionalKnowledgeBase({
      query: message,
      storeName,
      responseModel: resolveModel('chatResponse', chatModel),
      retrievalModel: resolveModel('retrieval', retrievalModel),
      temperature: 0.35,
      personaPrompt: effectiveSystemPrompt,
      contextMessages: boundedContextMessages,
    });

    res.json(response);
  } catch (error) {
    const messageText = error instanceof Error ? error.message : 'Member chat failed';
    res.status(500).json({ error: messageText });
  }
});

app.post('/api/history/clear', (_req, res) => {
  bot.clearHistory();
  res.json({ ok: true });
});

app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    res.status(404).json({ error: 'Not Found' });
    return;
  }

  if (isDev) {
    res.redirect(307, `http://localhost:${viteDevPort}${req.originalUrl}`);
    return;
  }

  const appIndex = path.join(staticRoot, 'index.html');
  if (fs.existsSync(appIndex)) {
    res.sendFile(appIndex);
    return;
  }

  res.status(404).send('Frontend build not found.');
});

app.listen(port, async () => {
  console.log(`Server started on http://localhost:${port}`);
  try {
    await ensureKnowledgeBase();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Knowledge base initialization failed: ${message}`);
  }
});
