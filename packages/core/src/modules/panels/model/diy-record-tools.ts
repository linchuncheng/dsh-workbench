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

function netFactsOf(
  payload: Record<string, unknown> | undefined,
): { readonly ready: boolean; readonly bar: boolean; readonly href: string; readonly title: string } | undefined {
  const box = payload?.['data'];
  const data = typeof box === 'object' && box !== null ? (box as Record<string, unknown>) : payload;
  if (data === undefined || data === null || typeof data['ready'] !== 'boolean') return undefined;
  const text = (key: string): string => (typeof data[key] === 'string' ? String(data[key]) : '');
  return { ready: data['ready'] === true, bar: data['bar'] === true, href: text('href'), title: text('title') };
}

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
      '打开一个浏览器窗口并置于前台，让用户录制一次真实写入（打开窗口需批准）。' +
      `同一时刻只允许一场录制；再次调用会开始下一段（收起上一个窗口，打开新窗口），不要先调用 ${DIY_RECORD_STOP_TOOL}。` +
      `开始或结束后用 ${DIY_RECORD_READ_TOOL} 读取该段；结束整场才用 ${DIY_RECORD_STOP_TOOL}（只在流程「完成」那一步）。` +
      '录制条上的「截图」无需另行批准（打开窗口已授权）。',
    parameters: RECORD_PREPARE_PARAMS,
    output: OUTPUT,
    async execute(raw: unknown, exec: DshToolRunContext) {
      const sessionId = sessionIdOf(exec) ?? '';
      if (flow !== undefined && flow.flowOf(sessionId) === null) flow.start(sessionId);
      const atStep = writeFlowOf(sessionId);
      if (atStep !== null && atStep.id !== 'record' && atStep.id !== 'supplement') {
        throw new Error(
          `当前停在「${atStep.title ?? atStep.id}」这一步。需要补充时，先用 workbench_diy_step 推进流程，不要开始新的一段。`,
        );
      }
      const used = segments.get(sessionId) ?? 0;
      if (atStep !== null && used >= RECORD_SEGMENT_CAP) {
        throw new Error(`本场已录制 ${String(RECORD_SEGMENT_CAP)} 段，达到上限。结束整场，并把缺口写进交代。`);
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
          '需要该页面的 url（用户访问系统的入口）。先用 workbench_diy_recon 探测，或询问用户通常在哪里查看；不要猜测站点。',
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
      if (seam === undefined) throw new Error('本机没有 shell 服务，无法打开录制窗口');
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
        const net = netFactsOf(armed.step.payload);
        if (armed.step.ok && page.ok && net !== undefined && !net.ready) {
          throw new Error(
            `录制条已注入，但页面未就绪（第 ${String(armed.part)}/${String(armed.parts)} 段均返回 ok；` +
              `录制条${net.bar ? '在' : '不在'} · href=${net.href || '?'} · title=${net.title || '?'}）。` +
              '通常是注入期间页面再次跳转：重新调用 prepare 一般可恢复；仍然失败就把这段交给维护者。',
          );
        }
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
            ? `${talk}（上一个窗口已收起，这是新的一段）· 第 ${String(used + 1)} 段`
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
      '读取本段录制到的请求（用户按「结束录制」后使用）。尚未开始或钩子未安装时会说明原因，不会误报为没有请求。',
    parameters: RECORD_READ_PARAMS,
    output: OUTPUT,
    async execute(raw: unknown, exec: DshToolRunContext) {
      const { seam, wire, sessionId, held, command } = doorOf(
        ctx,
        store,
        exec,
        '本机没有 shell 服务，无法读取录制',
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
            `这一段录制尚未结束（已等待约 ${waited} 秒）。用户按「结束录制」后再调用 read。`,
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
        ? ['用户按「结束录制」后已停止采集，录制窗口暂时保留（收尾时关闭）。下面是捕获文件中该段的清单。']
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
          ? `还缺 ${materials.missing.join(' / ')}。让用户补录：再次调用 ${DIY_RECORD_PREPARE_TOOL}（会收起上一个窗口，打开新窗口），不要调用 ${DIY_RECORD_STOP_TOOL}。`
          : atStep?.id === 'scan'
            ? `材料已齐全。下一步：检查录制结果（${DIY_STEP_TOOL} · needsSupplement / gaps）；完成后到「完成」再调用 ${DIY_RECORD_STOP_TOOL}。`
            : atStep?.id === 'supplement'
              ? `材料已齐全。若无需补录，把缺口清零并推进流程，然后到「完成」再调用 ${DIY_RECORD_STOP_TOOL}。`
              : `材料已齐全。要结束整场才调用 ${DIY_RECORD_STOP_TOOL}（会关闭窗口）；要补录就调用 ${DIY_RECORD_PREPARE_TOOL}（会收起上一个窗口，打开新窗口）。`
        : '';
      const said = stepOk
        ? [readText, ...materialsTextOf(materials), nextStep, timedOut ? `仍在录制。等用户按「结束录制」；需要等待时传入 waitMs，上限 ${String(WAIT_CAP_MS / 60000)} 分钟。` : '']
        : ['该页面已无法读取（录制窗口可能已关闭）。状态记录与捕获文件中的该段清单仍然保留：', readText];
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
      '结束整场：移除录制条、停止捕获、关闭标签页、清除状态。只在流程「完成」那一步可用。' +
      '写请求缺入参或出参时不会结束，会返回缺什么；无法补齐才传 force + forceWhy。',
    parameters: RECORD_STOP_PARAMS,
    output: OUTPUT,
    async execute(raw: unknown, exec: DshToolRunContext) {
      const session = sessionIdOf(exec) ?? '';
      const atStep = writeFlowOf(session);
      if (atStep !== null && atStep.id !== 'finish') {
        const hint =
          atStep.id === 'scan'
            ? `先用 ${DIY_STEP_TOOL} 提交录制结果检查（needsSupplement / gaps）并推进流程，再到「完成」结束整场。`
            : `要补录就调用 ${DIY_RECORD_PREPARE_TOOL}（会收起上一个窗口，打开新窗口），不要调用 ${DIY_RECORD_STOP_TOOL}。`;
        return plainJson({
          ok: false,
          code: 'flow-step',
          text: `尚未到结束整场的步骤（当前停在「${atStep.title ?? atStep.id}」）。${hint}`,
        });
      }
      const openGaps = flow === undefined ? [] : flow.gaps(session);
      if (openGaps.length > 0 && asRecord(raw)['force'] !== true) {
        return plainJson({
          ok: false,
          code: 'gaps-open',
          text:
            `本场还有未补齐的缺口：${openGaps.join(' / ')}。要补录就调用 ${DIY_RECORD_PREPARE_TOOL}；` +
            '无法补齐才传 force + forceWhy，并把缺口如实写进交代。',
        });
      }
      const { seam, wire, sessionId, held, command } = doorOf(ctx, store, exec, '本机没有 shell 服务，无法结束录制');
      const force = asRecord(raw)['force'] === true;
      const forceWhy = asText(asRecord(raw)['forceWhy']).trim();
      const page = held.phase === 'finished' ? recordPageOf(undefined) : await stopPageOf(seam, command, wire);
      const capture = captureReadOf(held.captureFile);
      const bundle = bundleOf(capture, page, held, browserRowsOf(ctx));
      const hookCaught = page.calls.length;
      const hookText = page.ok ? `页面钩子 ${String(hookCaught)} 条` : '页面钩子已随窗口关闭，无法读取条数';
      const noBody = bodyMissingOf(bundle.merged);
      const materials = materialsOf(bundle.merged, snapOfPage(page, held.captureFile), held.expect);
      if (materials.missing.length > 0 && !force) {
        return plainJson({
          ok: false,
          code: 'materials-missing',
          missing: materials.missing,
          text: [
            `暂不结束：这一段还缺 ${materials.missing.join(' / ')}。`,
            ...materialsTextOf(materials),
            '用户补齐这些后再调用；确实无法补齐时，才传 force: true + forceWhy（写清原因，会留痕）。',
          ].join('\n'),
        });
      }
      if (force && forceWhy === '') {
        return plainJson({
          ok: false,
          code: 'force-without-why',
          text: '使用 force 结束必须提供 forceWhy，说明这些材料为何无法补齐。',
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
          `录制已结束：${held.unit} 的「${held.action}」本段共 ${String(bundle.merged.length)} 条请求（${hookText}；会话捕获该段 ${String(bundle.inside.length)} 条）。`,
          ...materialsTextOf(materials),
          force ? `强制结束（${forceWhy}）。` : '',
          snapFile === '' ? '' : `表单原始 HTML 已保存到 ${snapFile}。`,
          kept
            ? `原文保留在 ${lastFile}（下一次 prepare 会清除）。要查看某一条，调用 ${DIY_RECORD_DETAIL_TOOL}：提供 unit + key；同一 key 跨轮会重名，同时带上清单中该行的 at 才能准确定位。`
            : '未保留原文（本场捕获文件为空，或捕获未启动）。需要某一条时，让用户从 DevTools 复制 curl。',
          bundle.capture.round === 'fail'
            ? '（会话捕获最近一轮未成功，本场可能只有页面钩子。）'
            : '',
          cleaned.tab ? '录制窗口的标签页已关闭。' : '该标签页未关闭，让用户手动关闭。',
          back ? '已把工作台切回前台。' : '未能自动切回工作台，让用户手动切换。',
          cleaned.capture ? '' : '捕获进程未完全停止（最多 15 分钟自动结束）。',
          probeCommand !== ''
            ? '本段原文可以直接写入 design.json 的 writes[].probeCommand。'
            : noBody
              ? '只有方法 / URL，无法获取请求体。先补全请求体，再写入 writes[].probeCommand。需要请求体时，让用户从 DevTools 复制 curl，或在用户页面上用 _eval 中的 fetch 发送一条同形请求（先征得用户同意）。'
              : '本段原文为空，不要写入 design.json。',
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
