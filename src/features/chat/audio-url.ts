import { useGatewayStore } from '../../stores/gateway-store';

function normalizeWorkspaceRelativePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\/+/, '');
}

export function buildGatewayAudioPath(
  workspaceRelativePath: string,
  sessionKey?: string | null,
): string {
  const rel = normalizeWorkspaceRelativePath(workspaceRelativePath);
  const params = new URLSearchParams({ path: rel });
  const sk = sessionKey?.trim();
  if (sk) params.set('sessionKey', sk);
  return `/api/workspace/editor/raw?${params.toString()}`;
}

export function buildGatewayAudioUrl(
  workspaceRelativePath: string,
  sessionKey?: string | null,
): string {
  return useGatewayStore.getState().apiUrl(buildGatewayAudioPath(workspaceRelativePath, sessionKey));
}

export function audioNameFromPath(path: string | undefined, fallback = 'voice.mp3'): string {
  const name = path?.split('/').filter(Boolean).pop()?.trim();
  return name || fallback;
}
