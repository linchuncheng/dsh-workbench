import type { Need, NeedProbeInput, RuntimePeerReport, Seam, UnitCapability } from '@dsh-workbench/shared/host';

export interface UnitProbeOptions {
  readonly seam: Seam;
  readonly runtimeCommands: Readonly<Record<string, string>>;
  readonly runtimeReport?: RuntimePeerReport | undefined;
  readonly force: boolean;
  readonly units: readonly NeedProbeInput[];
}

export interface UnitProbeDeps {
  readonly seam?: Seam | undefined;
  readonly runtimeCommands: Readonly<Record<string, string>>;
  readonly runtimeReport?: RuntimePeerReport | undefined;
  readonly inputs: () => readonly NeedProbeInput[];
  readonly released: (unit: string) => boolean;
  readonly probe: (options: UnitProbeOptions) => Promise<readonly UnitCapability[]>;
}

export function createUnitProbe(deps: UnitProbeDeps) {
  return async (unit: string, force = false, needs?: readonly Need[]): Promise<UnitCapability | undefined> => {
    const { seam, runtimeReport } = deps;
    if (seam === undefined) return undefined;
    const listed = deps.inputs();
    const declared = needs ?? listed.find((input) => input.unit === unit)?.needs;
    if (declared === undefined || declared.length === 0) return undefined;
    const units = listed.some((input) => input.unit === unit) ? listed : [...listed, { unit, needs: declared }];
    const options: UnitProbeOptions = {
      seam,
      runtimeCommands: deps.runtimeCommands,
      ...(runtimeReport === undefined ? {} : { runtimeReport }),
      force,
      units,
    };
    const found = (await deps.probe(options)).find((row) => row.unit === unit);
    return found === undefined ? undefined : { ...found, released: deps.released(unit) };
  };
}
