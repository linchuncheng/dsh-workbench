import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const HERE = new URL('../', import.meta.url);
const read = (name: string): string => readFileSync(new URL(name, HERE), 'utf8').replaceAll('\r\n', '\n');

const ROW = read('LongTaskRow.tsx');
const CSS = read('LongTaskRow.css');

describe('两按停止钮：接线（这仓的组件测试是 node 环境，读源码断言）', () => {
  it('★★ 不给 stop ⇒ 那颗钮整个不出现；文件里就一颗 button', () => {
    const gate = ROW.indexOf('{stop === undefined ? null : <StopControl');

    expect(ROW).toContain('const stop = props.stop;');
    expect(gate).toBeGreaterThan(0);
    expect(ROW.match(/<button/g)).toHaveLength(1);
  });

  it('★★ 住在 .wb-longTaskHead 里、最右边那颗（margin-left: auto）', () => {
    const head = ROW.indexOf('className="wb-longTaskHead"');
    const gate = ROW.indexOf('{stop === undefined ? null : <StopControl');
    const close = ROW.indexOf('</p>', gate);

    expect(head).toBeGreaterThan(0);
    expect(gate).toBeGreaterThan(head);
    expect(close).toBeGreaterThan(gate);
    expect(CSS).toContain('margin-left: auto');
  });

  it('★★ 两按只走 longTaskStopPress(longTaskStopStage({ armed, busy }))：arm 上膛 / fire 落膛并 onStop / ignore 不动', () => {
    expect(ROW).toContain('longTaskStopPress(longTaskStopStage({ armed, busy }))');
    expect(ROW).toContain('onClick={onPress}');
    expect(ROW).toContain("if (press === 'ignore') return;");
    expect(ROW).toContain("if (press === 'arm') {");
    expect(ROW).toContain('setArmed(true);');
    expect(ROW).toMatch(/setArmed\(false\);\s*onFired\(\);\s*stop\.onStop\(\);/);
  });

  it('★★ onBlur 落膛（焦点一走就退回没上膛）', () => {
    expect(ROW).toContain('onBlur={() => setArmed(false)}');
  });

  it('★★ 上膛后 3 秒自己落膛：用 LONG_TASK_STOP_ARM_MS，卸载 / 落膛都清掉计时器', () => {
    expect(ROW).toContain("from '../../contract/long-task.js'");
    expect(ROW).toContain('setTimeout(() => setArmed(false), LONG_TASK_STOP_ARM_MS)');
    expect(ROW).toContain('clearTimeout(timer)');
    expect(ROW).toContain('}, [armed]);');
  });

  it('★★ data-stop-state 交出那一档（照 dsh 的 data-kill-state）', () => {
    expect(ROW).toContain('data-stop-state={longTaskStopStage({ armed, busy })}');
  });

  it('★★ busy 时 disabled；上膛时多一个 span 显示 askLabel；三句词全部由调用点给', () => {
    expect(ROW).toContain('const busy = stop?.busy === true;');
    expect(ROW).toContain('disabled={busy}');
    expect(ROW).toContain('<span className="wb-longTaskStopLabel">{stop.askLabel}</span>');
    expect(ROW).toContain('aria-label={armed ? stop.armedLabel ?? stop.askLabel : stop.label}');
    expect(ROW).toContain('<IconStopFillRegular size={12} />');
    expect(ROW).toContain('type="button"');
    expect(ROW).not.toContain('Translate');
  });

  it('★★ failed 非空 ⇒ 在 problem 那行后面再画一行（wb-longTaskStopWhy）', () => {
    const problem = ROW.indexOf('className="wb-longTaskProblem"');
    const why = ROW.indexOf('className="wb-longTaskStopWhy"');

    expect(ROW).toContain("const stopWhy = stop?.failed ?? '';");
    expect(ROW).toContain('className="wb-longTaskStopWhy">{stopWhy}');
    expect(problem).toBeGreaterThan(0);
    expect(why).toBeGreaterThan(problem);
  });

  it('★★ 没有 stop 的行一个像素都不变：既要的规则一个字没动，新规则也只在带钮的行上起作用', () => {
    expect(CSS).toContain('.wb-longTaskHeadline {\n  margin: 0;');
    expect(CSS).toContain('.wb-longTaskLink {\n  flex: none;\n}');
    expect(CSS).toContain('.wb-longTaskHead {');
  });
});

describe('两按停止钮：样式跟 dsh 那颗钮同款（组件自带，同目录一份 .css）', () => {
  it('★★ 四个类都在同目录那份 .css 里', () => {
    for (const cls of [
      '.wb-longTaskStop {',
      '.wb-longTaskStopArmed,',
      '.wb-longTaskStopLabel {',
      '.wb-longTaskStopWhy {',
    ]) {
      expect(CSS).toContain(cls);
    }
  });

  it('★★ 上膛变宽（width: auto），取值照 dsh：error 45% 边框 + 12% 底 + gap 4 + padding 0 7px', () => {
    expect(CSS).toMatch(/\.wb-longTaskStopArmed[\s\S]*width: auto/);
    expect(CSS).toContain('color-mix(in srgb, var(--dsw-alias-state-error-primary) 45%, transparent)');
    expect(CSS).toContain('color-mix(in srgb, var(--dsw-alias-state-error-primary) 12%, transparent)');
    expect(CSS).toContain('gap: var(--wb-len-4)');
    expect(CSS).toContain('padding: 0 var(--wb-len-7)');
  });

  it('★★ 上膛那颗字 11px / 18px；失败那行 error 色', () => {
    expect(CSS).toContain('font-size: var(--dsw-font-xxxs-11-font-size)');
    expect(CSS).toContain('line-height: var(--wb-line-18)');
    expect(CSS).toMatch(/\.wb-longTaskStopWhy \{[\s\S]*--dsw-alias-state-error-primary/);
  });

  it('★ 一格注释都没有，颜色不写字面值（尺寸走 --wb-len-*）', () => {
    expect(CSS).not.toContain('/*');
    expect(CSS).not.toContain('#');
    expect(CSS).toContain('var(--wb-len-20)');
    expect(CSS).not.toMatch(/(^|[^a-z-])rgb\(/);
  });
});

describe('人工干预节点：结构化回执表单（fields + submit）', () => {
  it('★★ fields 与 submit 都在才画表单：input 只长在表单子组件里，没有 fields 的旧行不碰它', () => {
    const gate = ROW.indexOf('{fields.length === 0 || submit === undefined ? null : (');
    const usage = ROW.indexOf('<InterventionForm fields={fields} submit={submit} />');
    const helper = ROW.indexOf('function InterventionForm(');
    const form = ROW.indexOf('<form className="wb-longTaskForm" onSubmit={onSubmit}>');
    const input = ROW.indexOf('<input');

    expect(ROW).toContain('const fields = intervention.fields ?? [];');
    expect(ROW).toContain('const submit = intervention.submit;');
    expect(gate).toBeGreaterThan(0);
    expect(usage).toBeGreaterThan(gate);
    expect(helper).toBeGreaterThan(0);
    expect(form).toBeGreaterThan(helper);
    expect(input).toBeGreaterThan(helper);
    expect(ROW.indexOf('<input', input + 1)).toBe(-1);
  });

  it('★★ 每项一个 label + 输入框；secret 是 password，其余 text；autoComplete="off"', () => {
    expect(ROW).toContain('{fields.map((field) => (');
    expect(ROW).toContain('<label className="wb-longTaskField" key={field.key}>');
    expect(ROW).toContain('<span className="wb-longTaskFieldLabel">');
    expect(ROW).toContain("type={field.kind === 'secret' ? 'password' : 'text'}");
    expect(ROW).toContain('autoComplete="off"');
    expect(ROW).toContain('placeholder={field.placeholder}');
  });

  it('★★ 必填带 *；必填没填（或空串）时提交钮 disabled，busy 也禁用', () => {
    expect(ROW).toContain(
      '{field.required === true ? <span className="wb-longTaskFieldRequired">*</span> : null}',
    );
    expect(ROW).toContain("(field) => field.required === true && (values[field.key] ?? '').trim() === '',");
    expect(ROW).toContain('disabled={submitBusy || requiredMissing}');
    expect(ROW).toContain('type="submit"');
  });

  it('★★ 提交把整份 values 交给 submit.onSubmit；label 也由调用点给', () => {
    expect(ROW).toContain('const [values, setValues] = useState<Readonly<Record<string, string>>>({});');
    expect(ROW).toContain('submit.onSubmit({ ...values });');
    expect(ROW).toContain('{submit.label}');
    expect(ROW).toContain('setValues({ ...values, [field.key]: event.target.value })');
  });

  it('★★ submit.failed 用 wb-longTaskNeedWhy 画在表单下面（与动作失败同一行样式）', () => {
    const form = ROW.indexOf('<form');
    const why = ROW.indexOf('{submitFailed ===');

    expect(ROW).toContain('const submitFailed =');
    expect(ROW).toContain('<p className="wb-longTaskNeedWhy">{submitFailed}</p>');
    expect(why).toBeGreaterThan(form);
    expect(CSS).toContain('.wb-longTaskNeedWhy {');
  });

  it('★★ 表单样式在同目录 .css，尺寸 / 颜色全走令牌，零注释', () => {
    for (const cls of [
      '.wb-longTaskForm {',
      '.wb-longTaskField {',
      '.wb-longTaskFieldLabel {',
      '.wb-longTaskFieldRequired {',
      '.wb-longTaskFieldInput {',
    ]) {
      expect(CSS).toContain(cls);
    }
    expect(CSS).toContain('min-width: var(--wb-len-120)');
    expect(CSS).toContain('var(--dsw-alias-label-secondary)');
    expect(CSS).not.toContain('/*');
  });
});

describe('人工干预节点（needs-human）：标题 + 说明 + 动作，组件仍是哑的', () => {
  it('★★ 不给 intervention ⇒ 那一行整个不出现（旧行一个像素不变）', () => {
    expect(ROW).toContain('{props.intervention === undefined ? null : (');
    expect(ROW).toContain('className="wb-longTaskNeed"');
  });

  it('★★ 动作的 key / label / onPress 全由调用点给，primary 决定主按钮', () => {
    expect(ROW).toContain('(intervention.actions ?? []).map((action) => (');
    expect(ROW).toContain('key={action.key}');
    expect(ROW).toContain("variant={action.primary === true ? 'primary' : 'outline'}");
    expect(ROW).toContain('onClick={action.onPress}');
  });

  it('★ 标题与说明是两个 span，类都在同目录 .css 里', () => {
    expect(ROW).toContain('className="wb-longTaskNeedTitle">{intervention.title}');
    expect(ROW).toContain('className="wb-longTaskNeedHint"');
    for (const cls of ['.wb-longTaskNeed {', '.wb-longTaskNeedTitle {', '.wb-longTaskNeedHint {']) {
      expect(CSS).toContain(cls);
    }
  });
});

describe('行内可读：当前步骤 / 状态 · 耗时 / 结构化步骤 / 停止请求', () => {
  it('★★ 不给 step / meta 时一行都不多，给了才画', () => {
    expect(ROW).toContain("const step = props.step ?? '';");
    expect(ROW).toContain("const meta = props.meta ?? '';");
    expect(ROW).toContain('{step === \'\' ? null : <p className="wb-longTaskStep">{step}</p>}');
    expect(ROW).toContain('{meta === \'\' ? null : <p className="wb-longTaskMeta">{meta}</p>}');
  });

  it('★★ 点可以抬档（人待 warning），读屏有词', () => {
    expect(ROW).toContain('const dot = props.dot ?? longTaskDot(props.status);');
    expect(ROW).toContain('aria-label={props.dotLabel}');
  });

  it('★★ 有 history 走结构化行：一行一步 + 链接只认 http(s)、最多 3 条', () => {
    expect(ROW).toContain('<ul className="wb-longTaskSteps">');
    expect(ROW).toContain('const HTTP_PATTERN = /^https?:');
    expect(ROW).toContain('.filter((link) => HTTP_PATTERN.test(link.href))');
    expect(ROW).toContain('.slice(0, LONG_TASK_LINK_MAX)');
    expect(ROW).toContain('data-kind={row.kind}');
  });

  it('★★ 没有 history 回退旧 CodeBlock：旧模块一个像素不变', () => {
    expect(ROW).toContain('{history.length === 0 ? (');
    expect(ROW).toContain('code={steps.join(');
  });

  it('★★ 步骤块的展开不再绑死失败：给 stepsTitle 且有内容就画，失败默认开', () => {
    expect(ROW).toContain("useState(props.status === 'failed')");
    expect(ROW).toContain('if (failed) setStepsOpen(true);');
    expect(ROW).toContain('props.stepsTitle === undefined || (history.length === 0 && steps.length === 0)');
  });

  it('★★ 停止请求之后、模块确认之前，行上说一句；模块确认了就收', () => {
    expect(ROW).toContain("stopFired && live && !busy && stopWhy === ''");
    expect(ROW).toContain('className="wb-longTaskStopPending"');
    expect(ROW).toContain('const [stopFired, setStopFired] = useState(false);');
  });

  it('★ 新样式在同一份 .css：零注释、颜色不写字面值', () => {
    for (const cls of [
      '.wb-longTaskStep {',
      '.wb-longTaskMeta {',
      '.wb-longTaskStopPending {',
      '.wb-longTaskSteps {',
      '.wb-longTaskStepRow {',
      '.wb-longTaskStepText {',
      '.wb-longTaskStepLink {',
    ]) {
      expect(CSS).toContain(cls);
    }
    expect(CSS).toContain("[data-kind='fail'] .wb-longTaskStepText");
    expect(CSS).not.toContain('/*');
    expect(CSS).not.toContain('#');
  });
});
