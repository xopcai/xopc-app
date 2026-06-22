import { useGatewayStore } from '../../stores/gateway-store';
import { buildGatewayMediaReadPath, isMediaUri } from './media-uri';
import { workspaceRelativePathToApiPath } from './workspace-file-url';

export function buildGatewayAudioPath(
  workspaceRelativePath: string,
  sessionKey?: string | null,
): string {
  if (isMediaUri(workspaceRelativePath)) {
    return buildGatewayMediaReadPath(workspaceRelativePath, sessionKey);
  }
  return workspaceRelativePathToApiPath(workspaceRelativePath.replace(/^\/+/, ''), { sessionKey });
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
