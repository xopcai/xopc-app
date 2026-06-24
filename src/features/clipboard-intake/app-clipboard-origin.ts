import { hashClipboardText } from './clipboard-hash';

let latestAppClipboardHash: string | null = null;

export function rememberAppClipboardText(text: string): void {
  const trimmed = text.trim();
  latestAppClipboardHash = trimmed ? hashClipboardText(trimmed) : null;
}

export function isLatestAppClipboardHash(hash: string): boolean {
  return Boolean(latestAppClipboardHash) && latestAppClipboardHash === hash;
}

