/**
 * Map gateway `manageRoute` (web hash settings paths) to expo-router paths in xopc-app.
 */
export function mapManageRouteToAppPath(manageRoute: string | undefined): string | null {
  const r = manageRoute?.trim();
  if (!r) return null;
  switch (r) {
    case '/settings/agents':
      return '/agents';
    case '/settings/gateway':
      return '/settings/gateway';
    case '/settings/skills':
    case '/settings/sessions':
      return null;
    default:
      return null;
  }
}
