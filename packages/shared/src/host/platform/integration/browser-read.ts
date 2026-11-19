import type { HostOs } from '../../../contract/protocol/platform.js';
import { hostOsOf } from '../facts.js';

export function evalScriptArgOf(script: string, platform?: NodeJS.Platform | HostOs): string {
  if (hostOsOf(platform) !== 'win32') return script;
  const bytes = Buffer.from(script, 'utf8').toString('base64');
  const decoded = `eval(new TextDecoder().decode(Uint8Array.from(atob('${bytes}'), (one) => one.charCodeAt(0))))`;
  return `(async () => { const value = ${decoded}; return typeof value === 'function' ? value() : value; })()`;
}
