import type { DiagRecorder, ProvisionHandler, ProvisionRequest } from '@dsh-workbench/shared/host';

function changeOf(result: unknown): Record<string, unknown> | undefined {
  if (typeof result !== 'object' || result === null) return undefined;
  const change = (result as { change?: unknown }).change;
  return typeof change === 'object' && change !== null ? (change as Record<string, unknown>) : undefined;
}

function failedOf(result: unknown): boolean {
  if (typeof result !== 'object' || result === null) return false;
  if ((result as { ok?: unknown }).ok === false) return true;
  return changeOf(result)?.['application'] === 'failed';
}

function detailOf(request: ProvisionRequest, result: unknown): Record<string, string> {
  const change = changeOf(result);
  const code = change?.['errorCode'];
  const stage = change?.['stage'];
  return {
    action: request.action,
    ...(typeof code === 'string' && code !== '' ? { reason: code } : {}),
    ...(typeof stage === 'string' && stage !== '' ? { stage } : {}),
  };
}

function keyOf(request: ProvisionRequest): string {
  return `provision:${request.action}:${request.unit ?? request.id ?? request.spec ?? ''}`;
}

export function withDiagProvision(handler: ProvisionHandler, diag?: DiagRecorder): ProvisionHandler {
  return {
    ...handler,
    async handle(request: ProvisionRequest) {
      const result = await handler.handle(request);
      if (failedOf(result)) {
        diag?.once(keyOf(request), {
          code: 'SUPPLY_INSTALL_FAILED',
          level: 'error',
          ...(request.unit === undefined && request.spec === undefined
            ? {}
            : {
                subject: {
                  ...(request.unit === undefined ? {} : { unit: request.unit }),
                  ...(request.spec === undefined ? {} : { pkg: request.spec }),
                },
              }),
          detail: detailOf(request, result),
        });
      }
      return result;
    },
  };
}
