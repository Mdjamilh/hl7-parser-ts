import { Hl7ParseError } from "./encoding.js";

/**
 * A location in a message, 1-based like the HL7 spec:
 * `PID.5.1`, `PID.3[2].1`, `OBX[3].5`, `MSH.9.2`.
 * Unspecified occurrences mean "first" for `get` and "all" for `getAll`.
 */
export type Hl7Path = {
  segment: string;
  segmentIndex?: number;
  field: number;
  repetition?: number;
  component?: number;
  subcomponent?: number;
};

const PATTERN = /^([A-Z][A-Z0-9]{2})(?:\[(\d+)\])?\.(\d+)(?:\[(\d+)\])?(?:\.(\d+))?(?:\.(\d+))?$/;

export function parsePath(path: string): Hl7Path {
  const match = PATTERN.exec(path.trim().toUpperCase());
  if (!match) {
    throw new Hl7ParseError(`Invalid HL7 path "${path}". Expected e.g. PID.5.1 or OBX[2].5`);
  }
  const [, segment, segIdx, field, rep, component, sub] = match;
  const num = (v: string | undefined) => (v === undefined ? undefined : Number(v));
  const parsed: Hl7Path = { segment: segment!, field: Number(field) };
  if (parsed.field === 0) throw new Hl7ParseError(`HL7 paths are 1-based; got 0 in "${path}"`);
  for (const [key, value] of [
    ["segmentIndex", num(segIdx)],
    ["repetition", num(rep)],
    ["component", num(component)],
    ["subcomponent", num(sub)],
  ] as const) {
    if (value === 0) throw new Hl7ParseError(`HL7 paths are 1-based; got 0 in "${path}"`);
    if (value !== undefined) parsed[key] = value;
  }
  return parsed;
}
