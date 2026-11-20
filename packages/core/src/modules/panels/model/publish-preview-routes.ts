import type { RouteTable } from '@dsh-workbench/shared/host';
import { param } from '@dsh-workbench/shared/host';
import { MARKET_PUBLISH_PREVIEW_ROUTE } from '@dsh-workbench/shared/contract/protocol/market-index';
import { publishPreviewOf } from '@/shared/api/host/diy-publish-preview';

export interface PublishPreviewRoots {
  readonly registered: (workspace: string) => string | null;
}

export function publishPreviewRoutes(
  roots: PublishPreviewRoots,
  inferredAuthorOf: (root: string, unit: string) => Promise<string | undefined> = async () => undefined,
): RouteTable {
  return {
    [MARKET_PUBLISH_PREVIEW_ROUTE]: async (search) => {
      const unit = (param(search, 'unit') ?? '').trim();
      const version = (param(search, 'version') ?? '').trim();
      const author = (param(search, 'author') ?? '').trim();
      const changelog = param(search, 'changelog') ?? '';
      const changelogType = (param(search, 'changelogType') ?? '').trim();
      const workspace = (param(search, 'workspace') ?? '').trim();
      const root = workspace === '' ? null : roots.registered(workspace);
      if (unit === '' || root === null) return { ok: true, preview: null };
      let preview = publishPreviewOf(root, unit, { version, author, changelog, changelogType });
      if (preview !== null && author === '' && (preview.author === undefined || preview.author === '')) {
        const inferred = await inferredAuthorOf(root, unit);
        if (inferred !== undefined && inferred !== '') {
          const again = publishPreviewOf(root, unit, { version, author: inferred, changelog, changelogType });
          if (again !== null) preview = again;
        }
      }
      return { ok: true, preview };
    },
  };
}
