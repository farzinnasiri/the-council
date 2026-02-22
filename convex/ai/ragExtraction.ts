'use node';

import path from 'node:path';
import type { Id } from '../_generated/dataModel';

const TEXT_EXTENSIONS = new Set([
  '.txt',
  '.md',
  '.markdown',
  '.csv',
  '.json',
  '.xml',
  '.html',
  '.htm',
  '.rtf',
  '.log',
  '.yml',
  '.yaml',
]);

function normalizeExtractedText(raw: string): string {
  return raw
    .replace(/\0/g, ' ')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function isPdf(mimeType?: string, displayName?: string): boolean {
  if ((mimeType ?? '').toLowerCase() === 'application/pdf') return true;
  return path.extname(displayName ?? '').toLowerCase() === '.pdf';
}

function isTextLike(mimeType?: string, displayName?: string): boolean {
  if ((mimeType ?? '').toLowerCase().startsWith('text/')) return true;
  const ext = path.extname(displayName ?? '').toLowerCase();
  return TEXT_EXTENSIONS.has(ext);
}

async function extractPdfText(bytes: Buffer, displayName: string): Promise<string> {
  const mod = await import('pdf-parse/lib/pdf-parse.js');
  const parsePdf = ((mod as any).default ?? mod) as (pdfBuffer: Buffer) => Promise<{ text?: string }>;
  const parsed = await parsePdf(bytes);
  const cleaned = normalizeExtractedText(parsed?.text ?? '');
  if (!cleaned) {
    throw new Error(`No extractable text found in PDF "${displayName}"`);
  }
  return cleaned;
}

export async function extractTextFromStorage(
  ctx: any,
  input: {
    storageId: Id<'_storage'>;
    displayName: string;
    mimeType?: string;
  }
): Promise<string> {
  const blob = await ctx.storage.get(input.storageId);
  if (!blob) {
    throw new Error(`Staged file not found in storage: ${input.storageId}`);
  }

  const bytes = Buffer.from(await blob.arrayBuffer());
  if (isPdf(input.mimeType, input.displayName)) {
    return await extractPdfText(bytes, input.displayName);
  }

  if (isTextLike(input.mimeType, input.displayName)) {
    const cleaned = normalizeExtractedText(bytes.toString('utf8'));
    if (!cleaned) {
      throw new Error(`No extractable text found in "${input.displayName}"`);
    }
    return cleaned;
  }

  const ext = path.extname(input.displayName).toLowerCase() || '(none)';
  throw new Error(
    `Unsupported file type for KB ingest: "${input.displayName}" (mime=${input.mimeType ?? 'unknown'}, ext=${ext})`
  );
}
