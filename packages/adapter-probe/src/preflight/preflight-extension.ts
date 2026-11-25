import type { BrowserExtension } from '@dsh-workbench/shared/host';
import { bundledExtensionVersion } from './preflight-bridge.js';

export interface ExtensionTarget {
  readonly dir: string;
  readonly version?: string | undefined;
}

export interface ExtensionResolverInput {
  readonly extension?: (() => BrowserExtension | undefined) | undefined;
  readonly extensionDir?: string | undefined;
  readonly log?: ((message: string) => void) | undefined;
}

export function extensionResolverOf(input: ExtensionResolverInput): () => ExtensionTarget | undefined {
  return () => {
    if (input.extension !== undefined) {
      try {
        const found = input.extension();
        return found === undefined ? undefined : { dir: found.dir, version: found.version };
      } catch (error) {
        input.log?.(`[dsh-workbench] 读取浏览器扩展目录失败：${String(error)}`);
        return undefined;
      }
    }
    if (input.extensionDir === undefined) return undefined;
    return { dir: input.extensionDir, version: bundledExtensionVersion(input.extensionDir) };
  };
}
