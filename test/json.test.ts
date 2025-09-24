import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import * as lib from "../src/index.js";

const oru = () => lib.parseMessage(readFileSync(new URL("./fixtures/oru_r01.hl7", import.meta.url), "utf8"));

describe("toSegmentJson", () => {
  it("keys fields by position, flattening and omitting empties", () => {
    const [msh, pid] = lib.toSegmentJson(oru());
    expect(msh?.fields["MSH.9"]).toEqual(["ORU", "R01", "ORU_R01"]);
    expect(pid).toEqual({
      segment: "PID",
      fields: { "PID.1": "1", "PID.3": ["20007788", "", "", "GOODHEALTH", "MR"], "PID.5": ["SMITH", "ALEX", "J"], "PID.7": "19720705", "PID.8": "M" },
    });
  });
});

describe("summarize", () => {
  it("includes only the sections the message has", () => {
    const summary = lib.summarize(oru());
    expect(Object.keys(summary)).toEqual(["header", "patient", "observations"]);
    expect(lib.summarize(lib.parseMessage("MSH|^~\\&|A"))).toEqual({
      header: { sendingApplication: "A", messageType: {} },
    });
  });
});

describe("public API", () => {
  it("exports the documented entry points", () => {
    for (const name of ["parseMessage", "Hl7Message", "createAck", "MllpDecoder", "frameMessage", "readPatient", "readObservations", "parseHl7DateTime"]) {
      expect(lib).toHaveProperty(name);
    }
  });
});
