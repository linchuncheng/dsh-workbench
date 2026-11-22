import type { DshClientContext, SessionId, SessionsSnapshot, WorkspaceView } from '@dsh-workbench/shared';
import { isWorkshopPath, workshopPresetUpgrade } from '@/shared/api/diy';
import { currentSessionId, workspaceOfSession } from '@/modules/sessions';

export function installWorkshopPreset(ctx: DshClientContext): () => void {
  const sessions = ctx.get('sessions');
  if (sessions === undefined) return () => {};

  const asked = new Set<string>();
  const presets = ctx.remote.agentPresets;
  let defaultPreset: string | undefined;
  let learnedDefault = false;

  const workshopOf = (): WorkspaceView | undefined =>
    ctx.workspaces.list.getSnapshot().items.find((item) => isWorkshopPath(item.path));

  const learnDefault = (): void => {
    if (learnedDefault || presets === undefined) return;
    learnedDefault = true;
    void presets
      .list()
      .then((roster) => {
        if (!roster.ok) return;
        defaultPreset = roster.value.presets.find((one) => one.isDefault)?.id;
        upgrade();
      })
      .catch((error: unknown) => {
        console.warn(`[dsh-workbench] 读不到 dsh 的默认模式，工坊会话按标准模式处理 —— ${String(error)}`);
      });
  };

  const upgrade = (): void => {
    learnDefault();
    const snapshot = sessions.list.getSnapshot() as SessionsSnapshot;
    const sessionId = currentSessionId(snapshot, false);
    if (sessionId === undefined || asked.has(sessionId)) return;
    const workshop = workshopOf();
    if (workshop === undefined) return;
    if (presets === undefined) return;
    const workspace = workspaceOfSession(ctx.workspaces.list.getSnapshot().items, sessionId);
    const preset = workshopPresetUpgrade({
      workshop: workspace?.workspaceId === workshop.workspaceId,
      blank: snapshot.byId[sessionId]?.blank === true,
      preset: snapshot.byId[sessionId]?.projectionValues?.agentPreset,
      ...(defaultPreset === undefined ? {} : { defaultPreset }),
    });
    if (preset === undefined) return;
    asked.add(sessionId);
    void presets.select(sessionId as SessionId, preset).catch((error: unknown) => {
      console.warn(`[dsh-workbench] 工坊那条会话没切到 DIY 模式 —— ${String(error)}`);
    });
  };

  const offSessions = sessions.list.subscribe?.(upgrade) ?? (() => {});
  const offWorkspaces = ctx.workspaces.list.subscribe(upgrade);
  upgrade();
  return () => {
    offSessions();
    offWorkspaces();
  };
}
