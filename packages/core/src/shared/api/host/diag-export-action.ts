import type { DshHostContext, PostResource } from '@dsh-workbench/shared/host';
import { nowIso, workbenchRoot } from '@dsh-workbench/shared/host';
import { exportDiagBundle, type DiagExportResult } from './diag-export.js';
import { diagRoutesOf } from './diag-routes.js';

export const DIAG_EXPORT_RESOURCE = 'export-diagnostics';

export function diagExportAction(ctx: DshHostContext): PostResource {
  return {
    resource: DIAG_EXPORT_RESOURCE,
    unit: 'workbench',
    handle(): DiagExportResult {
      const root = workbenchRoot();
      return exportDiagBundle({
        recorder: diagRoutesOf(root).recorder,
        root,
        at: nowIso(),
        env: { node: process.versions.node, platform: process.platform },
        config: { hasContext: ctx.get('profileContext') !== undefined },
        runtime: {},
        checks: {},
      });
    },
  };
}
