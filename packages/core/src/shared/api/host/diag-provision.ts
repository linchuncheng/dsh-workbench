import type { DiagRecorder, ProvisionHandler, ProvisionRequest } from '@dsh-workbench/shared/host';

function failedOf(result: unknown): boolean {
  return typeof result === 'object' && result !== null && (result as { ok?: unknown }).ok === false;
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
          detail: { action: request.action },
        });
      }
      return result;
    },
  };
}
