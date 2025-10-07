import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { parseBatch } from "../src/batch.js";
import { parseMessage } from "../src/message.js";
import { validateMessage } from "../src/validate.js";

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");

describe("parseBatch", () => {
  it("splits a FHS/BHS-wrapped batch into messages", () => {
    const text = [
      "FHS|^~\\&|LAB",
      "BHS|^~\\&|LAB",
      fixture("adt_a01.hl7"),
      fixture("oru_r01.hl7"),
      "BTS|2",
      "FTS|1",
    ].join("\r");
    const messages = parseBatch(text);
    expect(messages.map((m) => m.controlId)).toEqual(["MSG00001", "LAB55821"]);
    expect(messages[1]?.segmentsNamed("OBX")).toHaveLength(4);
  });

  it("accepts a single message and rejects segments before the first MSH", () => {
    expect(parseBatch(fixture("adt_a01.hl7"))).toHaveLength(1);
    expect(() => parseBatch("PID|1\rMSH|^~\\&|A")).toThrow(/before the first MSH/);
  });
});

describe("validateMessage", () => {
  it("passes the sample messages", () => {
    expect(validateMessage(parseMessage(fixture("adt_a01.hl7")))).toEqual([]);
    expect(validateMessage(parseMessage(fixture("oru_r01.hl7")))).toEqual([]);
  });

  it("reports missing and malformed header fields", () => {
    const issues = validateMessage(parseMessage("MSH|^~\\&|A|B|C|D|2026-03-10||ADT^A08||X"));
    expect(issues.map((i) => [i.severity, i.path])).toEqual([
      ["error", "MSH.10"],
      ["warning", "MSH.11"],
      ["error", "MSH.12"],
      ["error", "MSH.7"],
      ["warning", "PID"],
    ]);
  });
});
