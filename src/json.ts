import type { Hl7Message } from "./message.js";
import { readAllergies, readHeader, readObservations, readPatient } from "./readers.js";

export type SegmentJson = { segment: string; fields: Record<string, unknown> };

/**
 * Collapses single-item arrays so "PID.8" is "F" rather than [[["F"]]].
 * Empty items in the middle stay as "" so positions keep their meaning;
 * only trailing empties are dropped.
 */
function simplify(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  const items = value.map(simplify).map((item) => item ?? "");
  while (items.length > 0 && items.at(-1) === "") items.pop();
  if (items.length === 0) return undefined;
  return items.length === 1 ? items[0] : items;
}

/**
 * A readable JSON form of every segment, keyed by HL7 position ("PID.5").
 * Empty fields are omitted; single components/repetitions are flattened.
 */
export function toSegmentJson(message: Hl7Message): SegmentJson[] {
  return message.segments.map((segment) => {
    const fields: Record<string, unknown> = {};
    segment.fields.forEach((field, i) => {
      if (i === 0) return;
      const value = simplify(field);
      if (value !== undefined) fields[`${segment.name}.${i}`] = value;
    });
    return { segment: segment.name, fields };
  });
}

/** The typed view: header, patient, allergies and grouped results, whichever the message contains. */
export function summarize(message: Hl7Message) {
  const observations = readObservations(message);
  const allergies = readAllergies(message);
  return {
    header: readHeader(message),
    ...(readPatient(message) && { patient: readPatient(message) }),
    ...(allergies.length > 0 && { allergies }),
    ...(observations.length > 0 && { observations }),
  };
}
