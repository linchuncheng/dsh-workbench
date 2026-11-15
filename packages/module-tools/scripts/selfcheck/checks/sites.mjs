import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { BIN, PACKAGES_DIR, fillPendingDesign } from '../lib.mjs';
import { sitesProblemOf } from '../../../src/contract/sites-file.mjs';
import { datasourceEntriesOf } from '../../../src/contract/datasource-file.mjs';

const TITLE =
  '站点表：清单 host.sites → src/sites.ts；配方只写 site 时生成物填 origin / authLoss、信封展开成绝对路径；' +
  '重复前缀 / 多段 dataPath 报错点名 key；重复 sync 幂等；无站点表的旧模块不生成 sites.ts';

export const checks = [
  {
    title: TITLE,
    run(_ctx, report) {
      const probe = mkdtempSync(join(PACKAGES_DIR, '.sites-'));
      const run = (args) => {
        try {
          const out = execFileSync(process.execPath, [BIN, ...args], {
            cwd: probe,
            encoding: 'utf8',
            stdio: 'pipe',
          });
          return { failed: false, out: String(out) };
        } catch (error) {
          return { failed: true, out: `${error.stdout ?? ''}${error.stderr ?? ''}` };
        }
      };
      const read = (file) => readFileSync(join(probe, file), 'utf8');
      const editDesign = (change) => {
        const design = JSON.parse(read('design.json'));
        change(design);
        writeFileSync(join(probe, 'design.json'), JSON.stringify(design, null, 2));
      };
      const editManifest = (change) => {
        const manifest = JSON.parse(read('package.json'));
        change(manifest.dsh.workbench);
        writeFileSync(join(probe, 'package.json'), JSON.stringify(manifest, null, 2));
      };
      const render = () => {
        const rendered = run(['design', 'render']);
        if (rendered.failed) throw new Error(`design render 起不来：${rendered.out}`);
      };
      const sync = () => run(['sync']);
      const problems = [];
      try {
        const init = run(['init', 'demo', '--dir', probe, '--template', 'diy']);
        if (init.failed) throw new Error(`init 起不来：${init.out}`);
        fillPendingDesign(probe);

        editManifest((raw) => {
          raw.host.sites = {
            oa: {
              origin: 'https://oa.example.com/',
              loginUrl: 'https://oa.example.com/login',
              authLoss: { path: 'errorCode', equals: '002' },
              envelope: { dataPath: 'data' },
              pagination: { pageParam: 'pageNo' },
            },
          };
        });
        editDesign((design) => {
          design.datasource.key = 'list';
          design.datasource.recipe = {
            site: 'oa',
            request: { method: 'GET', path: '/api/list' },
            response: { kind: 'json', path: 'list' },
          };
        });
        render();
        const first = sync();
        if (first.failed) problems.push(`带站点表的 sync 起不来：${first.out}`);
        if (!existsSync(join(probe, 'src/sites.ts'))) problems.push('清单有站点表，sync 没生成 src/sites.ts');
        else {
          const sites = read('src/sites.ts');
          if (!sites.includes('SITES') || !sites.includes('https://oa.example.com')) {
            problems.push('src/sites.ts 里没有站点常量');
          }
          if (!sites.includes('SiteName')) problems.push('src/sites.ts 里没有 SiteName');
        }
        const generated = read('src/datasource.ts');
        if (!generated.includes('https://oa.example.com')) problems.push('生成物里没填解析后的 origin');
        if (!generated.includes('data.list')) problems.push('信封没展开成绝对路径');
        if (!generated.includes('errorCode')) problems.push('生成物里没带站点 authLoss');
        if (generated.includes('site:') || generated.includes('envelope')) {
          problems.push('生成物里还留着底稿字段 site / envelope');
        }
        const again = sync();
        if (again.failed) problems.push(`第二次 sync 起不来：${again.out}`);
        if (existsSync(join(probe, 'src/sites.ts')) && read('src/datasource.ts') !== generated) {
          problems.push('同一条配方 sync 两次写出两份不同的文件');
        }

        editDesign((design) => {
          delete design.datasource.recipe.response;
          design.datasource.calls = {
            part: { path: '/api/part', response: { maxBytes: 2048 } },
            rel: { path: '/api/rel', response: { kind: 'json', path: 'rows' } },
          };
        });
        render();
        const withEnvelope = sync();
        if (withEnvelope.failed) problems.push(`带 calls 的 sync 起不来：${withEnvelope.out}`);
        else {
          const entries = datasourceEntriesOf(JSON.parse(read('design.json')), {
            oa: { origin: 'https://oa.example.com', envelope: { dataPath: 'data' } },
          });
          const entry = entries.find((one) => one.key === 'list');
          if (entry?.recipe.response?.path !== 'data') {
            problems.push('配方没写 response 时没按站点信封补 dataPath');
          }
          if (entry?.calls?.part?.response?.path !== undefined) {
            problems.push('calls 没写 response.path 却被注入了信封路径');
          }
          if (entry?.calls?.rel?.response?.path !== 'data.rows') {
            problems.push('calls 的 response.path 没按信封展开');
          }
        }
        editDesign((design) => {
          delete design.datasource.calls;
          design.datasource.recipe.response = { kind: 'json', path: 'list' };
        });
        render();

        const stale = sitesProblemOf(probe, {
          oa: { origin: 'https://oa.example.com' },
        });
        if (stale === undefined || !stale.includes('sync')) problems.push('站点表改了没点名 sync');

        editDesign((design) => {
          design.datasource.recipe.response = { kind: 'json', path: 'data.data' };
        });
        render();
        const duplicate = sync();
        if (!duplicate.failed) problems.push('data.data 重复前缀，sync 还是绿的');
        else if (!duplicate.out.includes('list:')) problems.push('重复前缀没点名 key');
        else if (duplicate.out.includes('\n    at ')) problems.push('sync 报错带内部栈');

        editDesign((design) => {
          design.datasource.recipe.site = 'nope';
        });
        render();
        const unknownSite = run(['design', 'check']);
        if (!unknownSite.failed) problems.push('配方指向未声明站点，design check 还是绿的');
        else if (!unknownSite.out.includes('nope')) problems.push('design check 没点名未声明站点');
        editDesign((design) => {
          design.datasource.recipe.site = 'oa';
        });
        render();

        editManifest((raw) => {
          raw.host.sites.oa.envelope = { dataPath: 'data.list' };
        });
        editDesign((design) => {
          design.datasource.recipe.response = { kind: 'json', path: 'rows' };
        });
        render();
        const multi = sync();
        if (!multi.failed) problems.push('多段 dataPath 下的相对路径，sync 还是绿的');
        else if (!multi.out.includes('dataPath 有多段')) problems.push('多段 dataPath 没给出可读错误');

        editManifest((raw) => {
          raw.host.sites = { 'oa-prod': { origin: 'https://oa.example.com' } };
        });
        editDesign((design) => {
          design.datasource.recipe = {
            site: 'oa-prod',
            request: { method: 'GET', path: '/api/other' },
            response: { kind: 'json', path: 'data.list' },
          };
        });
        render();
        const hyphen = sync();
        if (hyphen.failed) problems.push(`连字符站点名 sync 起不来：${hyphen.out}`);
        else if (!read('src/sites.ts').includes("'oa-prod':")) problems.push('连字符站点名没写成合法的 TS 键');

        editManifest((raw) => {
          delete raw.host.sites;
        });
        editDesign((design) => {
          design.datasource.recipe = {
            origin: 'https://x.example.com',
            request: { method: 'GET', path: '/api/other' },
          };
        });
        render();
        const legacy = sync();
        if (legacy.failed) problems.push(`无站点表的旧模块 sync 起不来：${legacy.out}`);
        if (existsSync(join(probe, 'src/sites.ts'))) problems.push('无站点表时仍留着旧的 src/sites.ts');
      } catch (error) {
        problems.push(String(error?.message ?? error).split('\n')[0]);
      } finally {
        rmSync(probe, { recursive: true, force: true });
      }
      report(TITLE, problems.length === 0, problems.join(' · '));
    },
  },
];
