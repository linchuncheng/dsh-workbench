import type { DshHostContext, PanelStateStore, PostResource } from '@dsh-workbench/shared/host';
import { PANEL_STATE_SERVICE, nowIso, profileManifestOf, unreadableModules, workbenchRoot } from '@dsh-workbench/shared/host';
import { exportDiagBundle, type DiagExportResult } from './diag-export.js';
import { diagRoutesOf } from './diag-routes.js';

export const DIAG_EXPORT_RESOURCE = 'export-diagnostics';

export function diagExportAction(ctx: DshHostContext): PostResource {
  return {
    resource: DIAG_EXPORT_RESOURCE,
    unit: 'workbench',
    handle(): DiagExportResult {
      const root = workbenchRoot();
      const dir = (ctx.get('profileContext') as { readonly dir?: string } | undefined)?.dir ?? null;
      const manifest = profileManifestOf(dir);
      const panels = (ctx.get(PANEL_STATE_SERVICE) as PanelStateStore | undefined)?.snapshot(null) ?? null;
      return exportDiagBundle({
        recorder: diagRoutesOf(root).recorder,
        root,
        at: nowIso(),
        env: { node: process.versions.node, profileDir: dir },
        config: {
          name: manifest?.['name'] ?? null,
          dependencies: Object.keys((manifest?.['dependencies'] as Record<string, unknown>) ?? {}).length,
          unreadable: [...unreadableModules(dir)],
        },
        runtime: { panels },
        checks: {
          codes: [...diagRoutesOf(root).recorder.counts().keys()].sort(),
          total: diagRoutesOf(root).recorder.recent().length,
        },
      });
    },
  };
}
