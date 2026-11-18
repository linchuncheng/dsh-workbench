import { toolRegistryOf } from './tool-registry-guard';
import { RECORD_PREPARE_PARAMS, RECORD_READ_PARAMS, RECORD_STOP_PARAMS } from './diy-record-params';
import type { DshHostContext, DshToolDefinition, DshToolRunContext } from '@dsh-workbench/shared/host';
import type { RecordExpect, RecordStore } from '@dsh-workbench/shared/host';
import { sessionIdOf, seamOf } from '@dsh-workbench/shared/host';
import { BROWSER_RECORD_SESSION } from '@dsh-workbench/shared/host';

import { cliCommandOf } from '@dsh-workbench/shared/host';
import { artifactsDirOf } from '@/shared/api/host/diy-artifacts';
import { closeLeftoverTabOf } from './diy-record';
import { asRecord, asText, OUTPUT, plainJson, unitsOf, workspaceOf } from './diy-context';
import { holdNotice, noticeMessage } from '@/shared/api/host/diy-debug-act';
import { readDesignOfModule } from '@/shared/api/host/diy-modules';
import { plainLine, wireOf } from './diy-browser';
import { actBrowser } from './diy-browser-act';
import { doorOf, stopPageOf } from './diy-record-door';
import { recordDetailToolOf } from './diy-record-detail-tool';
import { stopLiveCapture } from '@/shared/api/host/diy-capture-live';
import { openRecordWithRetryOf } from './diy-record-open';
import { armRecordPage, bringBackWorkbench, frontAppNow, raiseBrowserNow, rememberWorkbenchApp } from './diy-record';
import { browserRowsOf, surfaceOf } from '@/shared/api/host/runtime-surface';
import { RECORD_READ_SCRIPT } from './diy-record-read-scripts';
import {
  armFailureText,
  bodyMissingOf,
  filterTextOf,
  moveOrThrow,
  probeCommandOf,
  recordPageOf,
  type RecordPageRead,
  recordTalkOf,
  renderRecordRead,
} from './diy-record-text';
import { materialsOf, materialsTextOf } from './diy-record-materials';
import { recordEval, recordedTabOf, rememberRecordTab, saveSnapFile, snapViewOf } from './diy-record-tab';
import { readFormSnap } from '@/shared/api/host/diy-form-file';
import { watchRecordFinish } from './diy-record-watch';
import {
  DIY_RECORD_DETAIL_TOOL,
  DIY_RECORD_PREPARE_TOOL,
  DIY_RECORD_READ_TOOL,
  DIY_RECORD_STOP_TOOL,
  DIY_STEP_TOOL,
} from '../unit';
import {
  POLL_MS,
  WAIT_CAP_MS,
  bundleOf,
  captureFileOf,
  captureReadOf,
  foreignDomainText,
  keepCaptureOf,
  lastCaptureFileOf,
  pauseFor,
  releaseQuietly,
  startRecordCapture,
  waitOf,
} from './diy-record';

export interface RecordFlowPort {
  readonly flowOf: (session: string) => { readonly id: string } | null;
  readonly stepOf: (session: string) => { readonly id: string; readonly title?: string | undefined } | null;
  readonly start: (session: string) => void;
  readonly advance: (session: string, value: unknown) => Promise<void>;
  readonly finish: (session: string) => Promise<void>;
  readonly gaps: (session: string) => readonly string[];
}

export const RECORD_FLOW_ID = 'diy-write-record';
export const RECORD_SEGMENT_CAP = 3;

export function registerRecordTools(
  ctx: DshHostContext,
  store: RecordStore,
  flow?: RecordFlowPort,
): readonly (() => void)[] {
  const segments = new Map<string, number>();
  const writeFlowOf = (session: string): { readonly id: string; readonly title?: string | undefined } | null => {
    if (flow === undefined || flow.flowOf(session)?.id !== RECORD_FLOW_ID) return null;
    return flow.stepOf(session);
  };
  const tools = toolRegistryOf(ctx, '跳过录制交接工具注册');
  if (tools === undefined) return [];

  const prepareTool: DshToolDefinition = {
    name: DIY_RECORD_PREPARE_TOOL,
    description:
      '开一扇浏览器窗并置前，让用户录一次真实写入（开窗需批准）。' +
      `同一时刻只允许一场录制；再调它就是下一段（上一扇会收起，开一扇新的），不要先 ${DIY_RECORD_STOP_TOOL}。` +
      `开始或结束后用 ${DIY_RECORD_READ_TOOL} 读取该段；结束整场才用 ${DIY_RECORD_STOP_TOOL}（只在流程「完成」那一步）。` +
      '浮条「截图」无需另批（开窗已授权）：截图与快照一起进 ' +
      `${DIY_RECORD_DETAIL_TOOL} 的字段证据表。`,
    parameters: RECORD_PREPARE_PARAMS,
    output: OUTPUT,
    async execute(raw: unknown, exec: DshToolRunContext) {
      const sessionId = sessionIdOf(exec) ?? '';
      if (flow !== undefined && flow.flowOf(sessionId) === null) flow.start(sessionId);
      const atStep = writeFlowOf(sessionId);
      if (atStep !== null && atStep.id !== 'record' && atStep.id !== 'supplement') {
        throw new Error(
          `现在停在「${atStep.title ?? atStep.id}」这一步：要补什么先递进流程（workbench_diy_step），别开新一段。`,
        );
      }
      const used = segments.get(sessionId) ?? 0;
      if (atStep !== null && used >= RECORD_SEGMENT_CAP) {
        throw new Error(`这一场已经录了 ${String(RECORD_SEGMENT_CAP)} 段 —— 到顶了：结束整场，缺口写进交代。`);
      }
      const { root } = await workspaceOf(ctx, exec);
      const artifactsDir = artifactsDirOf(root);
      const args = asRecord(raw);
      const asked = asText(args['unit']);
      const { units } = unitsOf(ctx, root);
      const unit = asked !== '' ? asked : 'page';
      const found = units.find((one) => one.unit === unit);
      const url = asText(args['url']);
      if (url === '') {
        throw new Error(
          '需要该页面的 url（用户平时访问这套系统的入口；请先用 workbench_diy_recon，或询问用户平时在哪里查看）。我不猜测站点。',
        );
      }
      const foreign =
        found === undefined || found.dir === '' ? '' : foreignDomainText(readDesignOfModule(found.dir), url);
      if (foreign !== '') throw new Error(foreign);
      const doing = asText(args['doing']) || '操作';
      const rawExpect = asRecord(args['expect']);
      const method = asText(rawExpect['method']).toUpperCase();
      const urlContains = asText(rawExpect['urlContains']);
      const expect: RecordExpect | null = method === '' && urlContains === '' ? null : { method, urlContains };
      const seam = seamOf(ctx);
      if (seam === undefined) throw new Error('这台机器上没有 shell 服务，无法打开录制窗口');
      const wire = wireOf(ctx);
      const command = cliCommandOf(ctx);
      let held = store.live(Date.now());
      const captureFile = captureFileOf(artifactsDir, unit);
      if (held !== null && held.phase === 'finished') {
        store.stop(sessionId, Date.now());
        held = null;
      }
      moveOrThrow(
        store.begin({
          sessionId,
          workspace: root,
          unit,
          name: found?.name ?? unit,
          url,
          title: '',
          action: doing,
          expect,
          captureFile,
          now: Date.now(),
        }),
        held,
      );

      rememberWorkbenchApp(await frontAppNow(ctx));
      await closeLeftoverTabOf(seam, command, url, wire);
      try {
        const opened = await openRecordWithRetryOf({
          seam,
          command,
          session: BROWSER_RECORD_SESSION,
          url,
          captureFile,
          wire,
        });
        if (!opened.ok) throw new Error(opened.why);
        if (opened.page !== undefined) rememberRecordTab(opened.page, url);
        await raiseBrowserNow(ctx);

        const armed = await armRecordPage(seam, command, BROWSER_RECORD_SESSION, wire, { reset: true });
        const page = recordPageOf(armed.step.payload);
        if (!armed.step.ok || !page.ok) {
          throw new Error(
            armFailureText({
              raw: armed.step.stderr || armed.step.stdout,
              code: page.code,
              part: armed.part,
              parts: armed.parts,
            }),
          );
        }
        stopLiveCapture(captureFile);
        const capture = await startRecordCapture(
          seam,
          command,
          BROWSER_RECORD_SESSION,
          captureFile,
          browserRowsOf(ctx),
          surfaceOf(ctx)?.background ?? plainLine,
        );
        watchRecordFinish({ ctx, seam, command, sessionId, store, url, captureFile, wire });
        const talk = recordTalkOf();
        segments.set(sessionId, used + 1);
        return plainJson({
          workspace: root,
          ok: true,
          wrote: false,
          phase: page.phase,
          site: url,
          session: BROWSER_RECORD_SESSION,
          window: opened.reused ? 'reused' : 'opened',
          segment: used + 1,
          capture,
          captureFile,
          size: page.calls.length,
          talk,
          text: capture
            ? `${talk}（上一扇已收起，这是新的）· 第 ${String(used + 1)} 段`
            : `${talk}（捕获未启动，本次只有页面钩子）`,
        });
      } catch (error) {
        await releaseQuietly({ seam, command, session: BROWSER_RECORD_SESSION, url, captureFile, tab: recordedTabOf() });
        await bringBackWorkbench(ctx);
        store.stop(sessionId, Date.now());
        throw error;
      }
    },
  };

  const readTool: DshToolDefinition = {
    name: DIY_RECORD_READ_TOOL,
    description:
      '读取本次录制到的请求（用户按「结束录制」后使用）。未按开始或未安装钩子时都会说明，不会误报为"没有请求"。',
    parameters: RECORD_READ_PARAMS,
    output: OUTPUT,
    async execute(raw: unknown, exec: DshToolRunContext) {
      const { seam, wire, sessionId, held, command } = doorOf(
        ctx,
        store,
        exec,
        '这台机器上没有 shell 服务，无法读取录制',
      );
      const budget = waitOf(asRecord(raw)['waitMs']);
      const opened = budget === 0 ? 0 : Date.now();
      const deadline = opened + budget;
      const sync = (page: ReturnType<typeof recordPageOf>) => {
        if (page.ok && page.phase === 'recording' && page.t0 !== null) {
          if (store.live(Date.now())?.phase === 'armed') store.started(sessionId, page.t0, Date.now());
        }
        if (page.ok && page.phase === 'finished' && page.t1 !== null) {
          if (store.live(Date.now())?.phase === 'armed' && page.t0 !== null) {
            store.started(sessionId, page.t0, Date.now());
          }
          if (store.live(Date.now())?.phase === 'recording') store.finished(sessionId, page.t1, Date.now());
        }
      };
      const over = held.phase === 'finished';
      if (!over) await armRecordPage(seam, command, BROWSER_RECORD_SESSION, wire);
      let step = await actBrowser(
        seam,
        command,
        BROWSER_RECORD_SESSION,
        recordEval(RECORD_READ_SCRIPT),
        undefined,
        wire,
      );
      let page = recordPageOf(step.payload);
      const stepOk = step.ok;
      sync(page);
      while (budget > 0 && page.phase !== 'finished' && Date.now() < deadline) {
        await pauseFor(Math.min(POLL_MS, Math.max(0, deadline - Date.now())));
        step = await actBrowser(
          seam,
          command,
          BROWSER_RECORD_SESSION,
          recordEval(RECORD_READ_SCRIPT),
          undefined,
          wire,
        );
        const next = recordPageOf(step.payload);
        if (next.ok) page = next;
        sync(page);
      }
      const timedOut = !over && budget > 0 && page.phase !== 'finished';
      const waitedMs = opened === 0 ? 0 : Date.now() - opened;
      if (timedOut) {
        const waited = String(Math.round(budget / 1000));
        holdNotice(
          sessionId,
          noticeMessage(
            `录制尚未结束（已等待约 ${waited} 秒）。请用户按「结束」后再调用 read。`,
            `工作台 DIY：录制尚未结束（已等待约 ${waited} 秒）`,
          ),
        );
      }
      const state = store.live(Date.now()) ?? held;
      const capture = captureReadOf(state.captureFile);
      const bundle = bundleOf(capture, page, state, browserRowsOf(ctx));
      const hookCaught = page.calls.length;
      const nav = page.href !== '' && page.here !== '' && page.href !== page.here;
      const noBody = bodyMissingOf(bundle.merged);
      const materials = materialsOf(bundle.merged, snapOfPage(page, held.captureFile), state.expect);
      const readText = renderRecordRead({
        phase: stepOk ? (page.ok ? page.phase : state.phase) : state.phase,
        armed: over ? true : stepOk ? page.ok : true,
        hookCaught,
        rows: bundle.rows,
        merged: bundle.merged.length,
        capturedLines: bundle.entries.length,
        capturedInSegment: bundle.inside.length,
        capturedOutside: bundle.outside,
        capturedTotalLines: capture.totalLines,
        capturedTruncated: capture.truncated,
        capturedTailLimit: capture.tailLimit,
        dropped: page.dropped,
        nav,
        filter: filterTextOf(state.expect),
        captureRound: bundle.capture.round,
        shots: state.shotsSeen,
      });
      const note = over
        ? ['用户按「结束」后采集已停，录制窗口先留着（收尾时才关）。以下为捕获文件里该段的清单。']
        : [];
      let atStep = writeFlowOf(sessionId);
      if (flow !== undefined && over && materials.missing.length === 0 && atStep !== null) {
        if (atStep.id === 'record' || atStep.id === 'supplement') {
          await flow.advance(sessionId, { rows: bundle.rows }).catch(() => undefined);
          atStep = writeFlowOf(sessionId);
        }
      }
      const nextStep = over
        ? materials.missing.length > 0
          ? `还缺 ${materials.missing.join(' / ')} —— 让用户补录：再调 ${DIY_RECORD_PREPARE_TOOL}（上一扇会收起，开一扇新的），不要 ${DIY_RECORD_STOP_TOOL}。`
          : atStep?.id === 'scan'
            ? `材料齐了。下一步：探测（${DIY_STEP_TOOL} · needsSupplement / gaps）；探测完到「完成」再 ${DIY_RECORD_STOP_TOOL}。`
            : atStep?.id === 'supplement'
              ? `材料齐了。不用补录就把缺口清零递进流程，然后到「完成」再 ${DIY_RECORD_STOP_TOOL}。`
              : `材料齐了。确实要结束整场才 ${DIY_RECORD_STOP_TOOL}（会关窗）；要补录就 ${DIY_RECORD_PREPARE_TOOL}（这一扇会收起，开一扇新的）。`
        : '';
      const said = stepOk
        ? [readText, ...materialsTextOf(materials), nextStep, timedOut ? `仍在录制。请等用户按「结束」（需要等待时传入 waitMs，上限 ${String(WAIT_CAP_MS / 60000)} 分钟）。` : '']
        : ['该页面上已无法读取（录制窗口可能已关闭）。台账与捕获文件中的该段清单仍然保留：', readText];
      const text = [...note, ...said].filter((one) => one !== '').join('\n');
      return plainJson({
        ok: stepOk && page.ok,
        phase: state.phase,
        t0: state.t0,
        t1: state.t1,
        rows: bundle.rows,
        gaps: materials.missing,
        segment: segments.get(sessionId) ?? 0,
        dropped: page.dropped,
        captureLines: bundle.entries.length,
        capturedInSegment: bundle.inside.length,
        capturedOutside: bundle.outside,
        capturedTotalLines: capture.totalLines,
        capturedTruncated: capture.truncated,
        hookCaught,
        noBody,
        nav,
        waitedMs,
        timedOut,
        text,
      });
    },
  };

  const snapOfPage = (page: ReturnType<typeof recordPageOf>, captureFile: string): RecordPageRead['snap'] =>
    page.snap ?? snapViewOf(readFormSnap(captureFile));

  const detailTool = recordDetailToolOf(ctx, store);

  const stopTool: DshToolDefinition = {
    name: DIY_RECORD_STOP_TOOL,
    description:
      '结束整场：卸浮条、停捕获、关标签、清状态。只在流程「完成」那步可用；' +
      '写请求缺入参/出参就先不结束，缺什么回给你；补不了才传 force+forceWhy。',
    parameters: RECORD_STOP_PARAMS,
    output: OUTPUT,
    async execute(raw: unknown, exec: DshToolRunContext) {
      const session = sessionIdOf(exec) ?? '';
      const atStep = writeFlowOf(session);
      if (atStep !== null && atStep.id !== 'finish') {
        const hint =
          atStep.id === 'scan'
            ? `先把探测结果递进流程（${DIY_STEP_TOOL} · needsSupplement / gaps），再到「完成」结束整场。`
            : `要补录就 ${DIY_RECORD_PREPARE_TOOL}（这一扇会收起，开一扇新的），不要 ${DIY_RECORD_STOP_TOOL}。`;
        return plainJson({
          ok: false,
          code: 'flow-step',
          text: `还没到结束整场那一步（现在停在「${atStep.title ?? atStep.id}」）：${hint}`,
        });
      }
      const openGaps = flow === undefined ? [] : flow.gaps(session);
      if (openGaps.length > 0 && asRecord(raw)['force'] !== true) {
        return plainJson({
          ok: false,
          code: 'gaps-open',
          text:
            `这一场还有没补上的缺口：${openGaps.join(' / ')} —— 要补就 ${DIY_RECORD_PREPARE_TOOL}；` +
            '补不了才传 force+forceWhy，缺口照实写进交代。',
        });
      }
      const { seam, wire, sessionId, held, command } = doorOf(ctx, store, exec, '这台机器上没有 shell 服务，无法结束录制');
      const force = asRecord(raw)['force'] === true;
      const forceWhy = asText(asRecord(raw)['forceWhy']).trim();
      const page = held.phase === 'finished' ? recordPageOf(undefined) : await stopPageOf(seam, command, wire);
      const capture = captureReadOf(held.captureFile);
      const bundle = bundleOf(capture, page, held, browserRowsOf(ctx));
      const hookCaught = page.calls.length;
      const hookText = page.ok ? `页面钩子 ${String(hookCaught)} 条` : '页面钩子已随窗口关闭，条数读不到了';
      const noBody = bodyMissingOf(bundle.merged);
      const materials = materialsOf(bundle.merged, snapOfPage(page, held.captureFile), held.expect);
      if (materials.missing.length > 0 && !force) {
        return plainJson({
          ok: false,
          code: 'materials-missing',
          missing: materials.missing,
          text: [
            `先别结束：这一段还缺 ${materials.missing.join(' / ')}。`,
            ...materialsTextOf(materials),
            '让他补齐这几样再调一次；确实补不了，才传 force: true + forceWhy（写清原因，会留痕）。',
          ].join('\n'),
        });
      }
      if (force && forceWhy === '') {
        return plainJson({
          ok: false,
          code: 'force-without-why',
          text: '要用 force 结束得给 forceWhy —— 写清为什么这几样补不了，别空着。',
        });
      }
      const snapFile = page.snap === null ? '' : await saveSnapFile(seam, command, held.captureFile, wire);
      const kept = keepCaptureOf(held.captureFile);
      const cleaned = await releaseQuietly({
        seam,
        command,
        session: BROWSER_RECORD_SESSION,
        url: held.url,
        captureFile: held.captureFile,
        wire,
        tab: recordedTabOf(),
      });
      const back = false;
      store.stop(sessionId, Date.now());
      if (flow !== undefined && flow.flowOf(sessionId)?.id === RECORD_FLOW_ID) await flow.finish(sessionId);
      segments.delete(sessionId);
      const probeCommand = probeCommandOf(bundle.merged);
      const lastFile = lastCaptureFileOf(held.captureFile);
      return plainJson({
        ok: true,
        phase: 'idle',
        rows: bundle.rows,
        lastFile: kept ? lastFile : '',
        dropped: page.dropped,
        captureLines: bundle.entries.length,
        capturedInSegment: bundle.inside.length,
        capturedOutside: bundle.outside,
        hookCaught,
        noBody,
        probeCommand,
        materials: {
          writes: materials.writes.length,
          hasRequest: materials.hasRequest,
          hasResponse: materials.hasResponse,
          required: materials.snap === null ? [] : materials.snap.required,
          missing: materials.missing,
        },
        cleaned: { ...cleaned, hook: page.ok && page.unhooked },
        snapFile,
        text: [
          `录制已结束：${held.unit} 的「${held.action}」该段共 ${String(bundle.merged.length)} 条请求（${hookText}；会话捕获该段 ${String(bundle.inside.length)} 条）。`,
          ...materialsTextOf(materials),
          force ? `强制结束（${forceWhy}）。` : '',
          snapFile === '' ? '' : `表单原始 HTML 存在 ${snapFile}。`,
          kept
            ? `原文保留在 ${lastFile}（下一场 prepare 会清除）。如需查看某一条，请使用 ${DIY_RECORD_DETAIL_TOOL}：提供 unit + key；同一个 key 跨轮会重名，再带上清单中该行的 at 即可准确定位。`
            : '未保留原文（本场捕获文件为空或捕获未启动）。如需某一条，请让用户从 DevTools 复制 curl。',
          bundle.capture.round === 'fail'
            ? '（会话捕获最近一轮未成功，本场可能只有页面钩子。）'
            : '',
          cleaned.tab ? '录制窗口的标签已关闭。' : '该标签未关闭，请用户手动关闭。',
          back ? '已把工作台那一页调回前台。' : '没能自动切回工作台，请用户自己切一下。',
          cleaned.capture ? '' : '捕获进程未完全停止（最多 15 分钟自动结束）。',
          probeCommand !== ''
            ? '这段原文可以直接写入 design.json 的 writes[].probeCommand。'
            : noBody
              ? '只有方法 / URL，无法获取 body。请先补全 body，再写入 writes[].probeCommand。如需请求体，请让用户从 DevTools 复制 curl，或在用户页面上用 _eval 中的 fetch 发送一条同形请求（先征得用户同意）。'
              : '本段原文为空，请勿写入 design.json。',
          '不要重放这段请求：没有预览模式时，写入一次即为真实写入。',
        ]
          .filter((one) => one !== '')
          .join('\n'),
      });
    },
  };

  return [
    tools.register(prepareTool),
    tools.register(readTool),
    tools.register(detailTool),
    tools.register(stopTool),
  ];
}
