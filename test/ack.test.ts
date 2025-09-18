import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { createAck } from "../src/ack.js";
import { parseMessage } from "../src/message.js";

const adt = () => parseMessage(readFileSync(new URL("./fixtures/adt_a01.hl7", import.meta.url), "utf8"));
const now = new Date("2026-03-10T13:16:00Z");

describe("set", () => {
  it("sets nested values, growing the structure as needed", () => {
    const msg = parseMessage("MSH|^~\\&|A\rPID|1");
    msg.set("PID.5.2", "JANE").set("PID.5.1", "DOE").set("PID.3[2].1", "X9");
    expect(msg.get("PID.5.2")).toBe("JANE");
    expect(msg.getRaw("PID.5")).toBe("DOE^JANE");
    expect(msg.getAll("PID.3.1")).toEqual(["X9"]);
    expect(msg.toString()).toBe("MSH|^~\\&|A\rPID|1||~X9||DOE^JANE");
  });

  it("appends the next occurrence of a segment but not a gap", () => {
    const msg = parseMessage("MSH|^~\\&|A");
    msg.set("NTE.3", "first").set("NTE[2].3", "second");
    expect(msg.getAll("NTE.3")).toEqual(["first", "second"]);
    expect(() => msg.set("NTE[4].3", "gap")).toThrow(/before NTE\[3\]/);
    expect(() => msg.set("MSH.2", "x")).toThrow(/delimiters/);
  });
});

describe("createAck", () => {
  it("swaps routing, echoes the control id and accepts by default", () => {
    const ack = createAck(adt(), { now });
    expect(ack.toString()).toBe(
      [
        "MSH|^~\\&|RECEIVER|ANYTOWN|REGADT|GOODHEALTH|20260310131600+0000||ACK^A01^ACK|ACKMSG00001|P|2.5.1",
        "MSA|AA|MSG00001",
      ].join("\r"),
    );
  });

  it("supports error acknowledgments with text and a custom control id", () => {
    const ack = createAck(adt(), { code: "AE", text: "Unknown patient | rejected", controlId: "A1", now });
    expect(ack.get("MSA.1")).toBe("AE");
    expect(ack.get("MSA.3")).toBe("Unknown patient | rejected");
    expect(ack.toString()).toContain("MSA|AE|MSG00001|Unknown patient \\F\\ rejected");
    expect(ack.controlId).toBe("A1");
  });

  it("uses the original message's delimiters", () => {
    const ack = createAck(parseMessage("MSH#$*@%#SND#FAC#RCV#RFAC#2026##ORU$R01#77#P#2.3"), { now });
    expect(ack.toString().startsWith("MSH#$*@%#RCV#RFAC#SND#FAC#")).toBe(true);
    expect(ack.get("MSA.2")).toBe("77");
  });
});
