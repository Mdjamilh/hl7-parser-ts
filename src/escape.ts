import type { Delimiters } from "./encoding.js";

/**
 * Decodes HL7 escape sequences (v2.5 §2.7.4) in a leaf value:
 * \F\ \S\ \T\ \R\ \E\ become the delimiters, \.br\ a line break, \Xhh..\ the
 * hex-encoded bytes (UTF-8). Formatting escapes (\H\, \N\, \.sp\ …) are
 * dropped; unknown sequences are kept as written rather than guessed at.
 */
export function unescapeValue(value: string, d: Delimiters): string {
  const e = d.escape;
  if (!value.includes(e)) return value;

  let out = "";
  let i = 0;
  while (i < value.length) {
    const char = value[i]!;
    const end = char === e ? value.indexOf(e, i + 1) : -1;
    if (end === -1) {
      out += char;
      i += 1;
      continue;
    }
    const code = value.slice(i + 1, end);
    out += decodeSequence(code, d) ?? value.slice(i, end + 1);
    i = end + 1;
  }
  return out;
}

function decodeSequence(code: string, d: Delimiters): string | null {
  switch (code) {
    case "F":
      return d.field;
    case "S":
      return d.component;
    case "T":
      return d.subcomponent;
    case "R":
      return d.repetition;
    case "E":
      return d.escape;
    case ".br":
      return "\n";
    case "H":
    case "N":
      return "";
  }
  if (/^\.(sp|in|ti|ce|fi|nf)/.test(code)) return "";
  if (/^X([0-9A-Fa-f]{2})+$/.test(code)) {
    const bytes = code
      .slice(1)
      .match(/../g)!
      .map((h) => parseInt(h, 16));
    return new TextDecoder().decode(new Uint8Array(bytes));
  }
  return null;
}

/** Escapes delimiter characters and line breaks so a value can be written into a message. */
export function escapeValue(value: string, d: Delimiters): string {
  let out = "";
  for (const char of value) {
    if (char === d.escape) out += `${d.escape}E${d.escape}`;
    else if (char === d.field) out += `${d.escape}F${d.escape}`;
    else if (char === d.component) out += `${d.escape}S${d.escape}`;
    else if (char === d.subcomponent) out += `${d.escape}T${d.escape}`;
    else if (char === d.repetition) out += `${d.escape}R${d.escape}`;
    else if (char === "\n") out += `${d.escape}.br${d.escape}`;
    else if (char !== "\r") out += char;
  }
  return out;
}
