import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { parseMessage } from "../src/message.js";
import { readAllergies, readHeader, readObservations, readPatient } from "../src/readers.js";

const load = (name: string) => parseMessage(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));

describe("readHeader", () => {
  it("reads routing, type, control id and the timestamp", () => {
    const header = readHeader(load("adt_a01.hl7"));
    expect(header).toMatchObject({
      sendingApplication: "REGADT",
      sendingFacility: "GOODHEALTH",
      receivingApplication: "RECEIVER",
      messageType: { code: "ADT", trigger: "A01", structure: "ADT_A01" },
      controlId: "MSG00001",
      processingId: "P",
      version: "2.5.1",
    });
    expect(header.sentAt?.instant?.toISOString()).toBe("2026-03-10T13:15:30.000Z");
  });
});

describe("readPatient", () => {
  it("reads identifiers, name, birth date, sex, address and phone", () => {
    expect(readPatient(load("adt_a01.hl7"))).toEqual({
      identifiers: [
        { value: "10006579", assigningAuthority: "GOODHEALTH", type: "MR" },
        { value: "123-45-6789", assigningAuthority: "USSSA", type: "SS" },
      ],
      name: { family: "DOE", given: "JANE", middle: "Q", prefix: "MS" },
      birthDate: "1980-02-14",
      sex: "F",
      address: { street: "1200 N ELM ST", city: "GREENSBORO", state: "NC", postalCode: "27401-1020", country: "USA" },
      phone: "(555)555-2004",
    });
  });

  it("returns undefined without a PID segment and ignores unknown sex codes", () => {
    expect(readPatient(parseMessage("MSH|^~\\&|A"))).toBeUndefined();
    expect(readPatient(parseMessage("MSH|^~\\&|A\rPID|1||7||X^Y||2001|Q"))?.sex).toBeUndefined();
  });
});

describe("readObservations", () => {
  it("groups results under their order with typed values, ranges and flags", () => {
    const [group] = readObservations(load("oru_r01.hl7"));
    expect(group).toMatchObject({
      placerOrderNumber: "ORD448",
      fillerOrderNumber: "LAB448",
      test: { code: "80048", text: "Basic metabolic panel", system: "CPT" },
      resultStatus: "F",
    });
    expect(group?.observations).toHaveLength(4);

    const [glucose, creatinine, potassium, comment] = group!.observations;
    expect(glucose).toMatchObject({
      code: { code: "2345-7", text: "Glucose", system: "LN" },
      value: 182,
      units: "mg/dL",
      referenceRange: { low: 70, high: 99, text: "70-99" },
      flags: ["H"],
      abnormal: true,
    });
    expect(creatinine).toMatchObject({ value: 0.9, flags: ["N"], abnormal: false });
    expect(potassium).toMatchObject({ value: 5.9, flags: ["HH"], abnormal: true });
    expect(comment).toMatchObject({ valueType: "ST", value: "Specimen slightly hemolyzed & repeat suggested" });
    expect(group?.notes).toEqual(["Called critical potassium to Dr. Attend at 13:28"]);
  });

  it("parses one-sided ranges and keeps non-numeric NM values as text", () => {
    const msg = parseMessage(
      "MSH|^~\\&|A\rOBX|1|NM|X^LDL||95|mg/dL|<100|N\rOBX|2|NM|Y^HDL||>60|mg/dL|>=40|N\rOBX|3|NM|Z||12|u|neg",
    );
    const [group] = readObservations(msg);
    expect(group?.observations.map((o) => [o.value, o.referenceRange])).toEqual([
      [95, { high: 100, text: "<100" }],
      [">60", { low: 40, text: ">=40" }],
      [12, { text: "neg" }],
    ]);
  });
});

describe("readAllergies", () => {
  it("reads AL1 segments", () => {
    expect(readAllergies(load("adt_a01.hl7"))).toEqual([
      { type: "DA", allergen: { code: "PENICILLIN", text: "Penicillin" }, severity: "SV", reactions: ["Hives"] },
    ]);
  });
});
