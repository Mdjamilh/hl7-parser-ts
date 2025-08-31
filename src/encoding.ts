/**
 * The five delimiters an HL7 v2 message declares in MSH-1 and MSH-2.
 * Defaults are the near-universal `|^~\&`.
 */
export type Delimiters = {
  field: string;
  component: string;
  repetition: string;
  escape: string;
  subcomponent: string;
};

export const DEFAULT_DELIMITERS: Delimiters = {
  field: "|",
  component: "^",
  repetition: "~",
  escape: "\\",
  subcomponent: "&",
};

export class Hl7ParseError extends Error {
  constructor(
    message: string,
    /** 1-based segment (line) number where the problem was found, if known. */
    readonly segment?: number,
  ) {
    super(segment ? `${message} (segment ${segment})` : message);
    this.name = "Hl7ParseError";
  }
}

/** Reads delimiters from the first segment, which must be MSH. */
export function readDelimiters(header: string): Delimiters {
  if (!header.startsWith("MSH")) {
    throw new Hl7ParseError("A message must start with an MSH segment", 1);
  }
  const field = header[3];
  const encoding = header.slice(4, header.indexOf(field ?? "|", 4));
  if (!field || encoding.length < 4) {
    throw new Hl7ParseError("MSH-1 and MSH-2 must declare the field separator and four encoding characters", 1);
  }
  const [component, repetition, escape, subcomponent] = encoding as unknown as [string, string, string, string];
  const all = [field, component, repetition, escape, subcomponent];
  if (new Set(all).size !== all.length) {
    throw new Hl7ParseError("Delimiters must all be different characters", 1);
  }
  return { field, component, repetition, escape, subcomponent };
}

/** MSH-2 as written: component, repetition, escape and subcomponent characters. */
export const encodingCharacters = (d: Delimiters) => `${d.component}${d.repetition}${d.escape}${d.subcomponent}`;
