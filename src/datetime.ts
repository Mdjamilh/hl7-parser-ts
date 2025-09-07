export type Hl7Precision = "year" | "month" | "day" | "minute" | "second";

export type Hl7DateTime = {
  /** ISO 8601 text at the precision given, with the offset when one was sent. */
  iso: string;
  precision: Hl7Precision;
  /** Exact instant, only when the value includes a UTC offset; otherwise the moment is ambiguous. */
  instant?: Date;
};

// YYYY[MM[DD[HH[MM[SS[.S[S[S[S]]]]]]]]][+/-ZZZZ]
const DTM = /^(\d{4})(\d{2})?(\d{2})?(?:(\d{2})(\d{2})?(\d{2})?(?:\.(\d{1,4}))?)?([+-]\d{4})?$/;

/**
 * Parses an HL7 DT/DTM value such as "20260310081530-0500" or "19800214".
 * Returns undefined for empty or malformed input instead of guessing.
 */
export function parseHl7DateTime(value: string | undefined): Hl7DateTime | undefined {
  const match = value ? DTM.exec(value.trim()) : null;
  if (!match) return undefined;
  const [, y, mo, d, h, mi, s, frac, offset] = match;

  const month = mo ? Number(mo) : undefined;
  const day = d ? Number(d) : undefined;
  if ((month && (month < 1 || month > 12)) || (day && (day < 1 || day > 31))) return undefined;
  if ((h && Number(h) > 23) || (mi && Number(mi) > 59) || (s && Number(s) > 59)) return undefined;

  let iso = y!;
  let precision: Hl7Precision = "year";
  if (mo) [iso, precision] = [`${iso}-${mo}`, "month"];
  if (d) [iso, precision] = [`${iso}-${d}`, "day"];
  if (h) [iso, precision] = [`${iso}T${h}:${mi ?? "00"}`, "minute"];
  if (s) [iso, precision] = [`${iso}:${s}${frac ? `.${frac.padEnd(3, "0").slice(0, 3)}` : ""}`, "second"];

  if (offset && h) {
    iso += `${offset.slice(0, 3)}:${offset.slice(3)}`;
    const instant = new Date(iso);
    return Number.isNaN(instant.getTime()) ? undefined : { iso, precision, instant };
  }
  // Reject impossible calendar dates such as 20260231.
  if (day && new Date(`${y}-${mo}-${d}T00:00:00Z`).getUTCDate() !== day) return undefined;
  return { iso, precision };
}

/** Formats a Date as an HL7 DTM in UTC ("+0000"), to the second. */
export function formatHl7DateTime(date: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getUTCFullYear()}${p(date.getUTCMonth() + 1)}${p(date.getUTCDate())}` +
    `${p(date.getUTCHours())}${p(date.getUTCMinutes())}${p(date.getUTCSeconds())}+0000`
  );
}
