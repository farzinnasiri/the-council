import type { MessageSpeechResult } from '../../repository/CouncilRepository';

const CACHE_NAME = 'chat-tts-v1';
const CACHE_TTL_MS = 30 * 60 * 1000;
const LOOKUP_BASE_URL = 'https://the-council.local/tts-lookup/';
const ENTRY_BASE_URL = 'https://the-council.local/tts-entry/';

interface CachedLookupRecord {
  cacheKey: string;
  expiresAt: number;
}

interface CachedEntryRecord {
  messageId: string;
  expiresAt: number;
  payload: MessageSpeechResult;
}

const memoryCache = new Map<string, CachedEntryRecord>();

function buildLookupRequest(messageId: string) {
  return new Request(`${LOOKUP_BASE_URL}${encodeURIComponent(messageId)}`);
}

function buildEntryRequest(cacheKey: string) {
  return new Request(`${ENTRY_BASE_URL}${encodeURIComponent(cacheKey)}`);
}

function canUseCacheStorage() {
  return typeof window !== 'undefined' && 'caches' in window;
}

async function openSpeechCache() {
  return await caches.open(CACHE_NAME);
}

async function removeCacheStorageEntry(messageId: string, cacheKey?: string) {
  if (!canUseCacheStorage()) return;
  const cache = await openSpeechCache();
  await cache.delete(buildLookupRequest(messageId));
  if (cacheKey) {
    await cache.delete(buildEntryRequest(cacheKey));
  }
}

export async function readCachedSpeechEntry(messageId: string): Promise<MessageSpeechResult | null> {
  const memoryRecord = memoryCache.get(messageId);
  if (memoryRecord) {
    if (memoryRecord.expiresAt > Date.now()) {
      return memoryRecord.payload;
    }
    memoryCache.delete(messageId);
  }

  if (!canUseCacheStorage()) {
    return null;
  }

  const cache = await openSpeechCache();
  const lookupResponse = await cache.match(buildLookupRequest(messageId));
  if (!lookupResponse) {
    return null;
  }

  let lookup: CachedLookupRecord;
  try {
    lookup = (await lookupResponse.json()) as CachedLookupRecord;
  } catch {
    await removeCacheStorageEntry(messageId);
    return null;
  }

  if (!lookup.cacheKey || typeof lookup.expiresAt !== 'number' || lookup.expiresAt <= Date.now()) {
    await removeCacheStorageEntry(messageId, lookup.cacheKey);
    return null;
  }

  const entryResponse = await cache.match(buildEntryRequest(lookup.cacheKey));
  if (!entryResponse) {
    await removeCacheStorageEntry(messageId, lookup.cacheKey);
    return null;
  }

  let entry: CachedEntryRecord;
  try {
    entry = (await entryResponse.json()) as CachedEntryRecord;
  } catch {
    await removeCacheStorageEntry(messageId, lookup.cacheKey);
    return null;
  }

  if (entry.expiresAt <= Date.now()) {
    await removeCacheStorageEntry(messageId, lookup.cacheKey);
    return null;
  }

  return entry.payload;
}

export async function writeCachedSpeechEntry(messageId: string, payload: MessageSpeechResult): Promise<void> {
  const expiresAt = Date.now() + CACHE_TTL_MS;
  const lookup: CachedLookupRecord = {
    cacheKey: payload.cacheKey,
    expiresAt,
  };
  const entry: CachedEntryRecord = {
    messageId,
    expiresAt,
    payload,
  };

  memoryCache.set(messageId, entry);

  if (!canUseCacheStorage()) {
    return;
  }

  const cache = await openSpeechCache();
  await cache.put(
    buildLookupRequest(messageId),
    new Response(JSON.stringify(lookup), {
      headers: {
        'Content-Type': 'application/json',
      },
    })
  );
  await cache.put(
    buildEntryRequest(payload.cacheKey),
    new Response(JSON.stringify(entry), {
      headers: {
        'Content-Type': 'application/json',
      },
    })
  );
}
