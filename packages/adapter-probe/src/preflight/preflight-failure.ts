export type PreflightFailure = 'permission' | 'network' | 'missing' | 'host' | 'unknown';

export function classifyFailure(text: string): PreflightFailure {
  const lower = text.toLowerCase();
  if (/eacces|eperm|permission denied|operation not permitted/.test(lower)) return 'permission';
  if (
    /enotfound|etimedout|econnrefused|econnreset|econnaborted|eai_again|eproto|enetunreach|ehostunreach|enetdown|err_socket|und_err|err_pnpm_fetch_5|err_pnpm_meta_fetch_fail|err_pnpm_tarball_fetch|socket hang up|network|proxy|fetch failed|request failed|tls|ssl|certificate|self[- ]signed|unable to verify|tlssocket|onhttpsocketclose/.test(
      lower,
    )
  ) {
    return 'network';
  }
  if (/command not found|not found|no such file|enoent/.test(lower)) return 'missing';
  return 'unknown';
}
