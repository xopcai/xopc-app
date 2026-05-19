/** Path for gateway GET (inbound vs TTS); `rel` is relative to agent home. Keep in sync with web `attachment-utils-core`. */
export function workspaceRelativePathToApiPath(
  rel: string,
  opts?: { sessionKey?: string | null },
): string {
  const norm = rel.replace(/\\/g, '/');
  const q = encodeURIComponent(norm);
  const base = norm.startsWith('tts/')
    ? `/api/workspace/tts-file?rel=${q}`
    : `/api/workspace/inbound-file?rel=${q}`;
  const sk = opts?.sessionKey?.trim();
  if (!sk) return base;
  return `${base}&sessionKey=${encodeURIComponent(sk)}`;
}
