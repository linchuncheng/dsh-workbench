import type { BridgeFacts } from './bridge-report.js';

let last: BridgeFacts | undefined;

export function rememberBridgeFacts(facts: BridgeFacts | undefined): void {
  if (facts !== undefined) last = facts;
}

export function lastBridgeFacts(): BridgeFacts | undefined {
  return last;
}
