import { readFileSync } from 'node:fs';
import type { BrowserExtension, DshHostContext } from '@dsh-workbench/shared/host';
import type { AdapterSet } from '@dsh-workbench/shared/host';

export interface BrowserExtensionSource {
  readonly browserExtension?: ((ctx: DshHostContext) => BrowserExtension | undefined) | undefined;
}

export function browserExtensionInputOf(
  runtime: BrowserExtensionSource,
  ctx: DshHostContext,
): { readonly extension?: (() => BrowserExtension | undefined) | undefined } {
  const read = runtime.browserExtension;
  if (read === undefined) return {};
  return {
    extension: () => {
      try {
        return read(ctx);
      } catch (error) {
        ctx.logger?.warn?.(`[dsh-workbench] 读取浏览器扩展目录失败：${String(error)}`);
        return undefined;
      }
    },
  };
}

export function shippedAdapterSetSpec(moduleUrl: string): string {
  const read = JSON.parse(readFileSync(new URL('../../package.json', moduleUrl), 'utf8')) as {
    readonly workbench?: { readonly adapterSet?: unknown };
  };
  const spec = read.workbench?.adapterSet;
  if (typeof spec !== 'string' || spec.trim() === '')
    throw new Error('package.json 没写 workbench.adapterSet：外壳不知道该装哪份适配器集合');
  return spec.trim();
}

export async function shippedAdapterSet(ctx: DshHostContext): Promise<AdapterSet> {
  const spec = shippedAdapterSetSpec(import.meta.url);
  const mod = (await import(spec)) as {
    readonly createAdapterSet?: (context: DshHostContext) => AdapterSet | Promise<AdapterSet>;
  };
  const factory = mod.createAdapterSet;
  if (typeof factory !== 'function') throw new Error(`随包的适配器集合 ${spec} 没导出 createAdapterSet(ctx)`);
  return await factory(ctx);
}
