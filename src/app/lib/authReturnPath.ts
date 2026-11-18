export function getSafeAuthReturnPath(value: unknown): string | null {
  const requestedPath = typeof value === 'string'
    ? value
    : value && typeof value === 'object' && 'pathname' in value && typeof value.pathname === 'string'
      ? value.pathname
      : null;

  if (requestedPath === '/pos/auth' || requestedPath === '/pos/register-access') return requestedPath;
  return requestedPath && /^\/products\/[A-Za-z0-9_-]+$/.test(requestedPath)
    ? requestedPath
    : null;
}
