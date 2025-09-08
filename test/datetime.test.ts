import { describe, expect, it } from "vitest";

import { formatHl7DateTime, parseHl7DateTime } from "../src/datetime.js";

describe("parseHl7DateTime", () => {
  it("parses dates at every precision", () => {
    expect(parseHl7DateTime("2026")).toEqual({ iso: "2026", precision: "year" });
    expect(parseHl7DateTime("202603")).toEqual({ iso: "2026-03", precision: "month" });
    expect(parseHl7DateTime("19800214")).toEqual({ iso: "1980-02-14", precision: "day" });
    expect(parseHl7DateTime("202603101330")).toEqual({ iso: "2026-03-10T13:30", precision: "minute" });
    expect(parseHl7DateTime("20260310133005.25")).toEqual({ iso: "2026-03-10T13:30:05.250", precision: "second" });
  });

  it("returns an exact instant only when an offset is present", () => {
    const value = parseHl7DateTime("20260310081530-0500");
    expect(value?.iso).toBe("2026-03-10T08:15:30-05:00");
    expect(value?.instant?.toISOString()).toBe("2026-03-10T13:15:30.000Z");
    expect(parseHl7DateTime("20260310081530")?.instant).toBeUndefined();
  });

  it("rejects malformed and impossible values", () => {
    for (const bad of [undefined, "", "2026-03-10", "20261310", "20260231", "202603102560", "abc"]) {
      expect(parseHl7DateTime(bad)).toBeUndefined();
    }
  });
});

describe("formatHl7DateTime", () => {
  it("writes UTC with an explicit offset and round-trips", () => {
    const date = new Date("2026-03-10T13:15:30Z");
    const text = formatHl7DateTime(date);
    expect(text).toBe("20260310131530+0000");
    expect(parseHl7DateTime(text)?.instant).toEqual(date);
  });
});
