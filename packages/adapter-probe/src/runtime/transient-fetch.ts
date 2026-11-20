const TRANSIENT_FETCH_CODES = [
  'ERR_PNPM_FETCH_404',
  'ERR_PNPM_FETCH_5',
  'ERR_PNPM_META_FETCH_FAIL',
  'ERR_PNPM_TARBALL_FETCH',
  'ETIMEDOUT',
  'ECONNRESET',
  'ECONNREFUSED',
  'ECONNABORTED',
  'EAI_AGAIN',
  'ENOTFOUND',
  'ENETUNREACH',
  'EHOSTUNREACH',
  'ENETDOWN',
  'EPROTO',
  'EPIPE',
  'ERR_SOCKET',
  'UND_ERR',
  'socket hang up',
  'onHttpSocketClose',
  'fetch failed',
];

export function transientFetchIn(detail: string): boolean {
  return TRANSIENT_FETCH_CODES.some((code) => detail.includes(code));
}
