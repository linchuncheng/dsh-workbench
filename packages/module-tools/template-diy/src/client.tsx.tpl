import type { ClientContext, UnitClientApi, UnitClientFace } from '@dsh-workbench/core/contract';
import { OverviewCard } from './components/OverviewCard';
import { DECLARED_TOOLS } from './declared-tools';
import { messages } from './messages';

const UNIT_ID = '__UNIT__';

const face: UnitClientFace = {
  unit: UNIT_ID,
  messages,
  card: (props) =>
    OverviewCard({
      path: props.world.current.workspace?.path ?? '',
      refreshToken: props.refreshToken,
      onRefresh: props.onRefresh,
      t: props.t,
    }),
  approval: {
    tools: [DECLARED_TOOLS.addNote.name],
    plan: (input, t) => {
      const raw = typeof input.args['text'] === 'string' ? input.args['text'] : '';
      const text = raw.replace(/\s+/g, ' ').trim();
      return {
        object: t('__UNIT__.approval.object'),
        objectLabel: t('__UNIT__.approval.objectLabel'),
        change: t('__UNIT__.approval.change'),
        target: t('__UNIT__.approval.target'),
        impact: t('__UNIT__.approval.impact'),
        ...(text === '' ? {} : { extra: [{ label: t('__UNIT__.approval.extraLabel'), value: text }] }),
      };
    },
  },
};

export const inject = ['workbenchUnits'];

export function apply(ctx: ClientContext): void {
  const units = (ctx.get as (name: string) => UnitClientApi | undefined)('workbenchUnits');
  if (units === undefined) {
    console.warn(`[${UNIT_ID}] 外壳没有提供 workbenchUnits 服务：这张卡片装不进来`);
    return;
  }
  ctx.effect(() => units.registerUnit(face), `__NAME__: 注册 ${UNIT_ID}`);
}
