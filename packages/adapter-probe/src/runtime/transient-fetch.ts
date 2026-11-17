const TRANSIENT_FETCH_CODES = ['ERR_PNPM_FETCH_404', 'ERR_PNPM_FETCH_5', 'ETIMEDOUT', 'ECONNRESET', 'EAI_AGAIN'];

export function transientFetchIn(detail: string): boolean {
  return TRANSIENT_FETCH_CODES.some((code) => detail.includes(code));
}
