import type { DshHostContext, PanelStateStore, PostResource } from '@dsh-workbench/shared/host';
import { join } from 'node:path';
import { PANEL_STATE_SERVICE, WORKBENCH_ADAPTERS, nowIso, profileManifestOf, unreadableModules, workbenchRoot } from '@dsh-workbench/shared/host';
import type { AdapterSet } from '@dsh-workbench/shared/host';
import { exportDiagBundle, type DiagExportResult } from './diag-export.js';
import { diagHostOf, diagRoutesOf } from './diag-routes.js';
import { logTailOf, packageVersionOf } from './diag-export-logs.js';
import { preflightHostOf, readPreflightSnapshot } from './diag-preflight.js';

export function diagProfileDirOf(ctx: DshHostContext): string | null {
  return (ctx.get('profileContext') as { readonly dir?: string } | undefined)?.dir ?? null;
}

export const DIAG_EXPORT_RESOURCE = 'export-diagnostics';

function adaptersOf(ctx: DshHostContext): AdapterSet | undefined {
  return ctx.get(WORKBENCH_ADAPTERS, false) as AdapterSet | undefined;
}

function platformOf(ctx: DshHostContext): string | null {
  return adaptersOf(ctx)?.runtime.platformName?.(ctx) ?? null;
}

function versionOf(ctx: DshHostContext, moduleUrl: string): string | null {
  const adapters = adaptersOf(ctx);
  if (adapters === undefined) return null;
  return packageVersionOf(adapters.runtime.packageRoot(moduleUrl));
}

export function diagExportAction(ctx: DshHostContext): PostResource {
  return {
    resource: DIAG_EXPORT_RESOURCE,
    unit: 'workbench',
    handle(): DiagExportResult {
      const root = workbenchRoot();
      const host = diagHostOf(ctx);
      const routes = diagRoutesOf(root, host);
      const dir = (ctx.get('profileContext') as { readonly dir?: string } | undefined)?.dir ?? null;
      const manifest = profileManifestOf(dir);
      const panels = (ctx.get(PANEL_STATE_SERVICE) as PanelStateStore | undefined)?.snapshot(null) ?? null;
      const preflight = readPreflightSnapshot(root);
      const preflightHost = preflightHostOf(preflight);
      return exportDiagBundle({
        recorder: routes.recorder,
        root,
        at: nowIso(),
        host,
        env: {
          node: process.versions.node,
          platform: platformOf(ctx),
          version: versionOf(ctx, import.meta.url),
          profileDir: dir,
          host,
        },
        config: {
          name: manifest?.['name'] ?? null,
          dependencies: Object.keys((manifest?.['dependencies'] as Record<string, unknown>) ?? {}).length,
          unreadable: [...unreadableModules(dir)],
        },
        runtime: {
          panels,
          logs: { selfUpdate: logTailOf(join(root, 'self-update.log')) },
          preflight,
          preflightFrom: preflightHost?.profile ?? null,
          preflightAt: preflightHost?.at ?? null,
        },
        checks: {
          codes: [...routes.recorder.counts().keys()].sort(),
          total: routes.recorder.recent().length,
        },
      });
    },
  };
}
