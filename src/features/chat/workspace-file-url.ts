/** Path for gateway raw workspace reads; `rel` is relative to the session/agent workspace. */
export function workspaceRelativePathToApiPath(
  rel: string,
  opts?: { sessionKey?: string | null },
): string {
  const norm = rel.replace(/\\/g, '/');
  const params = new URLSearchParams({ path: norm });
  const sk = opts?.sessionKey?.trim();
  if (sk) params.set('sessionKey', sk);
  return `/api/workspace/editor/raw?${params.toString()}`;
}
