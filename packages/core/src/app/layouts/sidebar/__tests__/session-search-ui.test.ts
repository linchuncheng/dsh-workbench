import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const HERE = new URL('../', import.meta.url);
const read = (name: string): string => readFileSync(new URL(name, HERE), 'utf8');

const SIDEBAR = read('Sidebar.tsx');
const SIDEBAR_SEARCH = read('use-sidebar-search.ts');
const LIST = read('SessionList.tsx');
const SEARCH = read('SessionSearch.tsx');
const SEARCH_HOOK = read('use-session-search.ts');
const SEARCH_CSS = read('SessionSearch.module.css');

describe('会话搜索：照 dsh 官方的搜索框，搜全部工作区的会话', () => {
  it('★ 搜索框照官方：常驻输入框、展开动画、Esc 收起、叉号常显且点它清空', () => {
    expect(SEARCH_CSS).toContain('transition:');
    expect(SEARCH_CSS).toContain('max-width: var(--wb-len-28)');
    expect(SEARCH).toContain("placeholder={t('session.search.placeholder')}");
    expect(SEARCH).toContain("aria-label={t('session.search.clear')}");
    expect(SEARCH).toContain("event.key !== 'Escape'");
    expect(SEARCH).toContain('aria-expanded={open}');
    expect(SEARCH).toContain("<Tip label={t('session.search.label')} disabled={open}>");
    expect(SEARCH).toContain('{open ? (');
    expect(SEARCH_CSS).toContain('width: var(--wb-len-24)');
    expect(SEARCH_CSS).toContain('.clear:hover');
    expect(SEARCH_CSS).toMatch(/background: var\(--dsw-alias-interactive-bg-hover\)/);
  });

  it('★ 查询状态归左栏：搜索是跨工作区的，换项目不丢查询', () => {
    expect(SIDEBAR_SEARCH).toContain('const [query, setQuery] = useState');
    expect(SIDEBAR).not.toContain('currentProjectId');
    expect(SIDEBAR).toContain('query={search.query}');
    expect(SIDEBAR).toContain('searchSessions={props.searchSessions}');
  });

  it('★ 内容搜索按官方的节奏：250ms 防抖 + 取消上一次请求', () => {
    expect(SEARCH_HOOK).toContain('const SEARCH_DEBOUNCE_MS = 250');
    expect(SEARCH_HOOK).toContain('window.setTimeout');
    expect(SEARCH_HOOK).toContain('controller.abort()');
    expect(SEARCH_HOOK).toContain('searchSessions(normalizedQuery, controller.signal)');
  });

  it('★ 等结果时摆骨架行（没有本地命中两条、已有命中一条），照官方的 role="status"', () => {
    expect(LIST).toContain('<SessionSearchSkeleton rows={search.hits.hits.length === 0 ? 2 : 1} />');
    expect(LIST).toContain("aria-label={t('session.search.pending')}");
  });

  it('★ 搜索时直接平铺命中行：跨工作区、带摘要，不再套水位、也不出「展开其余」那一行', () => {
    expect(LIST).toContain('const shownRows = search.searching ? search.rows : watermark.visible.rows');
    expect(LIST).toContain('<SessionSearchResult');
    expect(LIST).toContain('workspace={hit.workspace}');
    expect(LIST).toContain('snippet={hit.snippet}');
    expect(LIST).toContain(') : watermark.expandedAll || watermark.visible.hiddenCount > 0 ? (');
  });
});
