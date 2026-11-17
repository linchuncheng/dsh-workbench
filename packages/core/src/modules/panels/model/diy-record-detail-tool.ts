import type { DshHostContext, DshToolDefinition, DshToolRunContext } from '@dsh-workbench/shared/host';
import { BROWSER_RECORD_SESSION, cliCommandOf, seamOf, sessionIdOf } from '@dsh-workbench/shared/host';
import type { RecordStore } from '@dsh-workbench/shared/host';
import { artifactsDirOf } from '@/shared/api/host/diy-artifacts';
import { asRecord, asText, OUTPUT, plainJson, workspaceOf } from './diy-context';
import { actBrowser } from './diy-browser-act';
import { wireOf } from './diy-browser';
import { browserRowsOf } from '@/shared/api/host/runtime-surface';
import { RECORD_READ_SCRIPT } from './diy-record-read-scripts';
import { captureEntriesOf, pickAllOf, pickOf } from './diy-record-capture';
import { recordEval } from './diy-record';
import { moveOrThrow, recordPageOf, renderRecordDetail } from './diy-record-text';
import type { RecordPageRead } from './diy-record-text';
import { DIY_RECORD_DETAIL_TOOL, DIY_RECORD_PREPARE_TOOL, DIY_RECORD_READ_TOOL } from '../unit';
import {
  DETAIL_MAX_BYTES,
  bundleOf,
  captureFileOf,
  captureLinesWithKeyOf,
  captureReadOf,
  detailOfCall,
  detailOfEntry,
  hookCallOf,
  lastCaptureFileOf,
} from './diy-record';

export function recordDetailToolOf(ctx: DshHostContext, store: RecordStore): DshToolDefinition {
return {
  name: DIY_RECORD_DETAIL_TOOL,
  description:
    '读取本次录制中某条请求的原文（request / response body）。先用 record_read 取清单（每条带 key），再挑一条；清单不删条。',
  parameters: {
    type: 'object',
    properties: {
      key: { type: 'string', description: '清单中该条的 key（原样传入，含 #2 后缀）。' },
      index: { type: 'integer', description: '清单序号（从 0 开始）；仅在录制进行时可用。' },
      at: {
        type: 'integer',
        description: '清单中该行的 at（毫秒时间戳）；同一 key 跨轮重名，带上即可定位。',
      },
      unit: { type: 'string', description: '录制已结束、只能读 rec-<unit>.jsonl.last 时提供。' },
      maxBody: {
        type: 'integer',
        description: `入参 / 出参各自最多回多少字符（默认 ${String(DETAIL_MAX_BYTES)}，0 = 不限）。`,
      },
    },
    additionalProperties: false,
  },
  output: OUTPUT,
  async execute(raw: unknown, exec: DshToolRunContext) {
    const { root } = await workspaceOf(ctx, exec);
    const artifactsDir = artifactsDirOf(root);
    const seam = seamOf(ctx);
    if (seam === undefined) throw new Error('这台机器上没有 shell 服务，无法读取详情');
    const args = asRecord(raw);
    const unit = asText(args['unit']);
    const askedKey = asText(args['key']).trim();
    const rawIndex = args['index'];
    const index = typeof rawIndex === 'number' && Number.isFinite(rawIndex) ? Math.floor(rawIndex) : null;
    const rawAt = args['at'];
    let at = typeof rawAt === 'number' && Number.isFinite(rawAt) ? Math.floor(rawAt) : null;
    const rawMax = args['maxBody'];
    const maxBytes =
      typeof rawMax === 'number' && Number.isFinite(rawMax) && rawMax >= 0 ? Math.floor(rawMax) : DETAIL_MAX_BYTES;
    const sessionId = sessionIdOf(exec) ?? '';
    const held = store.live(Date.now());
    if (held !== null && held.sessionId !== sessionId) moveOrThrow({ ok: false, code: 'not-owner' }, held);
    const file =
      held !== null ? held.captureFile : unit === '' ? '' : lastCaptureFileOf(captureFileOf(artifactsDir, unit));
    if (file === '') {
      throw new Error(
        `本次录制已不存在（已结束、已过期，或不属于当前会话）。请提供 unit（我会从取证目录读取 rec-<unit>.jsonl.last），或重新 ${DIY_RECORD_PREPARE_TOOL} 一场。`,
      );
    }
    const command = cliCommandOf(ctx);
  const wire = wireOf(ctx);
    let key = askedKey;
    let page: RecordPageRead | null = null;
    if (key === '') {
      if (index === null) throw new Error('请提供 key（清单中该条的 key）或 index（清单中的序号）。');
      if (held === null) {
        throw new Error('结束之后只能使用 key：index 是"该场清单中"的序号，本场清单已清除。');
      }
      page = recordPageOf(
        (await actBrowser(seam, command, BROWSER_RECORD_SESSION, recordEval(RECORD_READ_SCRIPT), undefined, wire)).payload,
      );
      const bundle = bundleOf(captureReadOf(file), page, held, browserRowsOf(ctx));
      const row = bundle.rows[index];
      if (row === undefined) {
        throw new Error(
          `该段清单中没有第 ${String(index)} 条（共 ${String(bundle.rows.length)} 条）。请先调用 ${DIY_RECORD_READ_TOOL} 获取最新清单。`,
        );
      }
      key = row.key;
      at = at ?? row.at;
      if (key === '') {
        const only = hookCallOf(page, `${row.method} ${row.url}`);
        if (only !== null) return detailOfCall(only, maxBytes);
      }
    }
    const candidates = pickAllOf(captureEntriesOf(captureLinesWithKeyOf(file, key), browserRowsOf(ctx)), key);
    const fromCapture = pickOf(candidates, key, at);
    if (fromCapture !== null) {
      return detailOfEntry(fromCapture, maxBytes, candidates.length);
    }
    const over = held === null || held.phase === 'finished';
    const livePage =
      page !== null || over
        ? page
        : recordPageOf((await actBrowser(seam, command, BROWSER_RECORD_SESSION, recordEval(RECORD_READ_SCRIPT), undefined, wire)).payload);
    const call = livePage === null ? null : hookCallOf(livePage, key);
    if (call !== null) return detailOfCall(call, maxBytes);
    return plainJson({
      ok: true,
      found: false,
      key,
      text: renderRecordDetail({
        found: false,
        where: '',
        method: '',
        url: '',
        status: 0,
        ct: '',
        at: 0,
        request: '',
        response: '',
        headers: '',
        requestFullSize: 0,
        responseFullSize: 0,
        requestSizeExact: false,
        responseSizeExact: false,
        ambiguous: 0,
        source: '',
        maxBytes,
        note: over
          ? `「${key}」不在该场录制的快照原文（${file}）中。该场录制已结束，页面也已关闭，无法从页面钩子读取。`
          : `「${key}」既不在该场录制的快照原文（${file}）中，也不在该页面的钩子记录中。`,
      }),
    });
  },
};
}
