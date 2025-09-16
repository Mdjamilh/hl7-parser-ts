import { DEFAULT_DELIMITERS, Hl7ParseError, encodingCharacters, readDelimiters, type Delimiters } from "./encoding.js";
import { escapeValue, unescapeValue } from "./escape.js";
import { parsePath, type Hl7Path } from "./path.js";

/** Leaf strings, already unescaped. */
export type Component = string[]; // subcomponents
export type Repetition = Component[];
export type Field = Repetition[];

export type Segment = {
  name: string;
  /** fields[n] is HL7 field n (fields[0] is unused so indexes match the spec). */
  fields: Field[];
};

const SEGMENT_NAME = /^[A-Z][A-Z0-9]{2}$/;

function parseField(raw: string, d: Delimiters): Field {
  return raw
    .split(d.repetition)
    .map((rep) => rep.split(d.component).map((comp) => comp.split(d.subcomponent).map((s) => unescapeValue(s, d))));
}

function parseSegment(line: string, d: Delimiters, lineNo: number): Segment {
  const name = line.slice(0, 3);
  if (!SEGMENT_NAME.test(name) || (line.length > 3 && line[3] !== d.field)) {
    throw new Hl7ParseError(`Invalid segment "${line.slice(0, 20)}"`, lineNo);
  }
  if (name === "MSH") {
    // MSH-1 is the field separator itself and MSH-2 the raw encoding characters.
    const rest = line.slice(4).split(d.field);
    const [encoding = "", ...others] = rest;
    return { name, fields: [[], [[[d.field]]], [[[encoding]]], ...others.map((f) => parseField(f, d))] };
  }
  const [, ...raw] = line.split(d.field);
  return { name, fields: [[], ...raw.map((f) => parseField(f, d))] };
}

function serializeField(field: Field, d: Delimiters): string {
  return field
    .map((rep) => rep.map((comp) => comp.map((s) => escapeValue(s, d)).join(d.subcomponent)).join(d.component))
    .join(d.repetition);
}

/** Drops empty trailing items so "A^^" and "A" serialize the same way. */
function trimEnd<T>(items: T[], isEmpty: (item: T) => boolean): T[] {
  let end = items.length;
  while (end > 0 && isEmpty(items[end - 1]!)) end--;
  return items.slice(0, end);
}

export class Hl7Message {
  constructor(
    readonly segments: Segment[],
    readonly delimiters: Delimiters = DEFAULT_DELIMITERS,
  ) {}

  /** Parses an HL7 v2 message in pipe-delimited (ER7) form. Accepts \r, \n or \r\n between segments. */
  static parse(text: string): Hl7Message {
    const lines = text
      .replace(/^﻿/, "")
      .split(/\r\n|\r|\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) throw new Hl7ParseError("The message is empty");
    const delimiters = readDelimiters(lines[0]!);
    return new Hl7Message(
      lines.map((line, i) => parseSegment(line, delimiters, i + 1)),
      delimiters,
    );
  }

  /** All segments with this name, in order. */
  segmentsNamed(name: string): Segment[] {
    return this.segments.filter((s) => s.name === name.toUpperCase());
  }

  /** The nth (1-based) segment with this name. */
  segment(name: string, occurrence = 1): Segment | undefined {
    return this.segmentsNamed(name)[occurrence - 1];
  }

  private fieldsAt(path: Hl7Path, all: boolean): Field[] {
    const segments = this.segmentsNamed(path.segment);
    const chosen = path.segmentIndex ? [segments[path.segmentIndex - 1]] : all ? segments : [segments[0]];
    return chosen.flatMap((s) => (s?.fields[path.field] ? [s.fields[path.field]!] : []));
  }

  private static leaf(rep: Repetition | undefined, path: Hl7Path): string | undefined {
    const value = rep?.[(path.component ?? 1) - 1]?.[(path.subcomponent ?? 1) - 1];
    return value === "" ? undefined : value;
  }

  /**
   * The value at a path, e.g. `get("PID.5.1")` → "DOE". Without a component
   * the first component is returned (`get("PID.8")` → "F"); use `getRaw` for
   * the whole element. Empty values return undefined.
   */
  get(path: string): string | undefined {
    const p = parsePath(path);
    const [field] = this.fieldsAt(p, false);
    return Hl7Message.leaf(field?.[(p.repetition ?? 1) - 1], p);
  }

  /**
   * Every value matching a path, across repeating segments and field
   * repetitions unless an index pins them: `getAll("OBX.5")` returns each
   * OBX's value; `getAll("PID.3.1")` each patient identifier.
   */
  getAll(path: string): string[] {
    const p = parsePath(path);
    return this.fieldsAt(p, true)
      .flatMap((field) => (p.repetition ? [field[p.repetition - 1]] : field))
      .map((rep) => Hl7Message.leaf(rep, p))
      .filter((v): v is string => v !== undefined);
  }

  /** The element at a path re-encoded as HL7 text, e.g. `getRaw("PID.5")` → "DOE^JANE^Q^^MS". */
  getRaw(path: string): string | undefined {
    const p = parsePath(path);
    const [field] = this.fieldsAt(p, false);
    if (!field) return undefined;
    const d = this.delimiters;
    if (p.segment === "MSH" && p.field <= 2) return field[0]?.[0]?.[0];
    if (p.repetition === undefined && p.component === undefined) return serializeField(field, d) || undefined;
    const rep = field[(p.repetition ?? 1) - 1];
    if (!rep) return undefined;
    if (p.component === undefined) return serializeField([rep], d) || undefined;
    const comp = rep[p.component - 1];
    if (!comp) return undefined;
    if (p.subcomponent === undefined) return comp.map((s) => escapeValue(s, d)).join(d.subcomponent) || undefined;
    return Hl7Message.leaf(rep, p);
  }

  /** Serializes back to ER7 with \r between segments, trimming empty trailing fields. */
  toString(): string {
    const d = this.delimiters;
    return this.segments
      .map((segment) => {
        if (segment.name === "MSH") {
          const rest = segment.fields.slice(3).map((f) => serializeField(f, d));
          return [`MSH${d.field}${encodingCharacters(d)}`, ...trimEnd(rest, (f) => f === "")].join(d.field);
        }
        const fields = segment.fields.slice(1).map((f) => serializeField(f, d));
        return [segment.name, ...trimEnd(fields, (f) => f === "")].join(d.field);
      })
      .join("\r");
  }

  /** MSH-9: message code, trigger event and structure, e.g. ADT / A01 / ADT_A01. */
  get type() {
    return { code: this.get("MSH.9.1"), trigger: this.get("MSH.9.2"), structure: this.get("MSH.9.3") };
  }

  /**
   * Sets a value at a path, growing the field/repetition/component arrays as
   * needed. Appends the segment if it doesn't exist yet. MSH-1 and MSH-2 are
   * fixed by the delimiters and can't be set.
   */
  set(path: string, value: string): this {
    const p = parsePath(path);
    if (p.segment === "MSH" && p.field <= 2) {
      throw new Hl7ParseError("MSH-1 and MSH-2 are defined by the message delimiters");
    }
    const occurrence = p.segmentIndex ?? 1;
    const existing = this.segmentsNamed(p.segment);
    let segment = existing[occurrence - 1];
    if (!segment) {
      if (occurrence !== existing.length + 1) {
        throw new Hl7ParseError(`Can't create ${p.segment}[${occurrence}] before ${p.segment}[${existing.length + 1}]`);
      }
      segment = { name: p.segment, fields: [[]] };
      this.segments.push(segment);
    }

    const grow = <T>(items: T[], index: number, make: () => T) => {
      while (items.length <= index) items.push(make());
      return items[index]!;
    };
    const field = grow(segment.fields, p.field, () => [[[""]]]);
    const rep = grow(field, (p.repetition ?? 1) - 1, () => [[""]]);
    const comp = grow(rep, (p.component ?? 1) - 1, () => [""]);
    grow(comp, (p.subcomponent ?? 1) - 1, () => "");
    comp[(p.subcomponent ?? 1) - 1] = value;
    return this;
  }

  /** MSH-10, the sender's unique id for this message. */
  get controlId() {
    return this.get("MSH.10");
  }

  /** MSH-12, the HL7 version, e.g. "2.5.1". */
  get version() {
    return this.get("MSH.12");
  }
}

export const parseMessage = (text: string) => Hl7Message.parse(text);
