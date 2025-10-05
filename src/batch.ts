import { Hl7ParseError } from "./encoding.js";
import { Hl7Message } from "./message.js";

const ENVELOPE = /^(FHS|BHS|BTS|FTS)/;

/**
 * Splits an HL7 batch or file (optionally wrapped in FHS/BHS … BTS/FTS) into
 * its messages. Each message starts at an MSH segment; envelope segments are
 * skipped. A plain single message works too.
 */
export function parseBatch(text: string): Hl7Message[] {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r\n|\r|\n/)
    .map((l) => l.trim())
    .filter((l) => l && !ENVELOPE.test(l));

  const messages: string[][] = [];
  lines.forEach((line, i) => {
    if (line.startsWith("MSH")) messages.push([line]);
    else if (messages.length === 0) throw new Hl7ParseError(`Segment before the first MSH`, i + 1);
    else messages.at(-1)!.push(line);
  });
  return messages.map((segments) => Hl7Message.parse(segments.join("\r")));
}
