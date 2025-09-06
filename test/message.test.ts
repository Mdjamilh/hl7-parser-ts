import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { Hl7ParseError } from "../src/encoding.js";
import { Hl7Message, parseMessage } from "../src/message.js";
import { parsePath } from "../src/path.js";

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
const adt = () => parseMessage(fixture("adt_a01.hl7"));
const oru = () => parseMessage(fixture("oru_r01.hl7"));

describe("parsePath", () => {
  it("parses segment, field, repetition, component and subcomponent", () => {
    expect(parsePath("pid.3[2].1")).toEqual({ segment: "PID", field: 3, repetition: 2, component: 1 });
    expect(parsePath("OBX[3].5")).toEqual({ segment: "OBX", segmentIndex: 3, field: 5 });
    expect(parsePath("PID.5.1.2")).toEqual({ segment: "PID", field: 5, component: 1, subcomponent: 2 });
  });

  it("rejects malformed and zero-based paths", () => {
    expect(() => parsePath("PID")).toThrow(Hl7ParseError);
    expect(() => parsePath("PID.0")).toThrow(/1-based/);
    expect(() => parsePath("PID.5.x")).toThrow(/Invalid HL7 path/);
  });
});

describe("Hl7Message.parse", () => {
  it("reads header fields with MSH numbering", () => {
    const msg = adt();
    expect(msg.get("MSH.1")).toBe("|");
    expect(msg.get("MSH.2")).toBe("^~\\&");
    expect(msg.get("MSH.3")).toBe("REGADT");
    expect(msg.type).toEqual({ code: "ADT", trigger: "A01", structure: "ADT_A01" });
    expect(msg.controlId).toBe("MSG00001");
    expect(msg.version).toBe("2.5.1");
  });

  it("reads components, repetitions and empty values", () => {
    const msg = adt();
    expect(msg.get("PID.5.1")).toBe("DOE");
    expect(msg.get("PID.5.2")).toBe("JANE");
    expect(msg.get("PID.5.4")).toBeUndefined();
    expect(msg.get("PID.8")).toBe("F");
    expect(msg.get("PID.3[2].1")).toBe("123-45-6789");
    expect(msg.getAll("PID.3.1")).toEqual(["10006579", "123-45-6789"]);
    expect(msg.get("ZZZ.1")).toBeUndefined();
  });

  it("collects values across repeating segments", () => {
    const msg = oru();
    expect(msg.segmentsNamed("OBX")).toHaveLength(4);
    expect(msg.getAll("OBX.3.2")).toEqual(["Glucose", "Creatinine", "Potassium", "Comment"]);
    expect(msg.get("OBX[3].5")).toBe("5.9");
    expect(msg.segment("OBX", 2)?.name).toBe("OBX");
  });

  it("unescapes leaf values", () => {
    expect(oru().get("OBX[4].5")).toBe("Specimen slightly hemolyzed & repeat suggested");
  });

  it("returns whole elements re-encoded with getRaw", () => {
    const msg = adt();
    expect(msg.getRaw("PID.5")).toBe("DOE^JANE^Q^^MS");
    expect(msg.getRaw("PID.3")).toBe("10006579^^^GOODHEALTH^MR~123-45-6789^^^USSSA^SS");
    expect(msg.getRaw("PID.3[2]")).toBe("123-45-6789^^^USSSA^SS");
    expect(msg.getRaw("MSH.2")).toBe("^~\\&");
    expect(oru().getRaw("OBX[4].5")).toBe("Specimen slightly hemolyzed \\T\\ repeat suggested");
  });

  it("accepts \\n and \\r\\n line endings, a BOM and blank lines", () => {
    const text = "﻿MSH|^~\\&|A|B\r\n\r\nPID|1||42\nPV1|1|O\n";
    const msg = parseMessage(text);
    expect(msg.segments.map((s) => s.name)).toEqual(["MSH", "PID", "PV1"]);
    expect(msg.get("PID.3")).toBe("42");
  });

  it("works with non-standard delimiters", () => {
    const msg = parseMessage("MSH#$*@%#APP#FAC\rPID#1##A$B*C$D");
    expect(msg.getAll("PID.3.2")).toEqual(["B", "D"]);
  });

  it("reports the segment number of invalid segments", () => {
    expect(() => parseMessage("MSH|^~\\&|A\rPID|1\rbad segment")).toThrow(/segment 3/);
    expect(() => parseMessage("")).toThrow(/empty/);
  });
});

describe("toString", () => {
  it.each(["adt_a01.hl7", "oru_r01.hl7"])("round-trips %s byte for byte", (name) => {
    const text = fixture(name).replace(/\r$/, "");
    expect(parseMessage(text).toString()).toBe(text);
  });

  it("escapes values that contain delimiters", () => {
    const msg = parseMessage("MSH|^~\\&|A\rNTE|1||x");
    msg.segment("NTE")!.fields[3] = [[["Na|K & Cl"]]];
    expect(msg.toString()).toBe("MSH|^~\\&|A\rNTE|1||Na\\F\\K \\T\\ Cl");
    expect(Hl7Message.parse(msg.toString()).get("NTE.3")).toBe("Na|K & Cl");
  });
});
