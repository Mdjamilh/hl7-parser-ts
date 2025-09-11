import { parseHl7DateTime, type Hl7DateTime } from "./datetime.js";
import type { Hl7Message, Segment } from "./message.js";

export type CodedValue = { code?: string; text?: string; system?: string };

const first = (segment: Segment | undefined, field: number, component = 1, repetition = 1) => {
  const value = segment?.fields[field]?.[repetition - 1]?.[component - 1]?.[0];
  return value === "" ? undefined : value;
};

const coded = (segment: Segment | undefined, field: number, repetition = 1): CodedValue | undefined => {
  const value: CodedValue = {};
  const code = first(segment, field, 1, repetition);
  const text = first(segment, field, 2, repetition);
  const system = first(segment, field, 3, repetition);
  if (code) value.code = code;
  if (text) value.text = text;
  if (system) value.system = system;
  return Object.keys(value).length > 0 ? value : undefined;
};

/** Drops undefined properties so results compare and serialize cleanly. */
function compact<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;
}

export type MessageHeader = {
  sendingApplication?: string;
  sendingFacility?: string;
  receivingApplication?: string;
  receivingFacility?: string;
  sentAt?: Hl7DateTime;
  messageType: { code?: string; trigger?: string; structure?: string };
  controlId?: string;
  processingId?: string;
  version?: string;
};

export function readHeader(message: Hl7Message): MessageHeader {
  const msh = message.segment("MSH");
  return compact({
    sendingApplication: first(msh, 3),
    sendingFacility: first(msh, 4),
    receivingApplication: first(msh, 5),
    receivingFacility: first(msh, 6),
    sentAt: parseHl7DateTime(first(msh, 7)),
    messageType: message.type,
    controlId: first(msh, 10),
    processingId: first(msh, 11),
    version: first(msh, 12),
  });
}

export type Patient = {
  identifiers: { value: string; assigningAuthority?: string; type?: string }[];
  name?: { family?: string; given?: string; middle?: string; suffix?: string; prefix?: string };
  birthDate?: string;
  sex?: "F" | "M" | "O" | "U" | "A" | "N";
  address?: { street?: string; city?: string; state?: string; postalCode?: string; country?: string };
  phone?: string;
};

/** Demographics from the first PID segment, or undefined if there is none. */
export function readPatient(message: Hl7Message): Patient | undefined {
  const pid = message.segment("PID");
  if (!pid) return undefined;

  const identifiers = (pid.fields[3] ?? [])
    .map((rep) =>
      compact({ value: rep[0]?.[0] ?? "", assigningAuthority: rep[3]?.[0] || undefined, type: rep[4]?.[0] || undefined }),
    )
    .filter((id) => id.value !== "");

  const name = compact({
    family: first(pid, 5, 1),
    given: first(pid, 5, 2),
    middle: first(pid, 5, 3),
    suffix: first(pid, 5, 4),
    prefix: first(pid, 5, 5),
  });
  const address = compact({
    street: first(pid, 11, 1),
    city: first(pid, 11, 3),
    state: first(pid, 11, 4),
    postalCode: first(pid, 11, 5),
    country: first(pid, 11, 6),
  });
  const sex = first(pid, 8);

  return compact({
    identifiers,
    name: Object.keys(name).length > 0 ? name : undefined,
    birthDate: parseHl7DateTime(first(pid, 7))?.iso.slice(0, 10),
    sex: sex && ["F", "M", "O", "U", "A", "N"].includes(sex) ? (sex as Patient["sex"]) : undefined,
    address: Object.keys(address).length > 0 ? address : undefined,
    phone: first(pid, 13),
  });
}

export type Observation = {
  setId?: number;
  valueType?: string;
  code?: CodedValue;
  /** Numbers for NM values, text otherwise. */
  value?: number | string;
  units?: string;
  referenceRange?: { low?: number; high?: number; text: string };
  /** Abnormal flags such as H, L, HH, LL, A. */
  flags: string[];
  /** True when any abnormal flag is set (anything other than N). */
  abnormal: boolean;
  status?: string;
  observedAt?: Hl7DateTime;
};

export type ObservationGroup = {
  placerOrderNumber?: string;
  fillerOrderNumber?: string;
  test?: CodedValue;
  observedAt?: Hl7DateTime;
  resultStatus?: string;
  observations: Observation[];
  notes: string[];
};

function parseRange(text: string | undefined): Observation["referenceRange"] {
  if (!text) return undefined;
  const between = /^\s*(-?\d+(?:\.\d+)?)\s*-\s*(-?\d+(?:\.\d+)?)\s*$/.exec(text);
  if (between) return { low: Number(between[1]), high: Number(between[2]), text };
  const upper = /^\s*<=?\s*(-?\d+(?:\.\d+)?)\s*$/.exec(text);
  if (upper) return { high: Number(upper[1]), text };
  const lower = /^\s*>=?\s*(-?\d+(?:\.\d+)?)\s*$/.exec(text);
  if (lower) return { low: Number(lower[1]), text };
  return { text };
}

function readObservation(obx: Segment): Observation {
  const valueType = first(obx, 2);
  const raw = first(obx, 5);
  const numeric = valueType === "NM" && raw !== undefined && raw.trim() !== "" && !Number.isNaN(Number(raw));
  const flags = (obx.fields[8] ?? []).map((rep) => rep[0]?.[0] ?? "").filter(Boolean);
  const setId = first(obx, 1);
  return compact({
    setId: setId ? Number(setId) : undefined,
    valueType,
    code: coded(obx, 3),
    value: numeric ? Number(raw) : raw,
    units: first(obx, 6),
    referenceRange: parseRange(first(obx, 7)),
    flags,
    abnormal: flags.some((f) => f !== "N"),
    status: first(obx, 11),
    observedAt: parseHl7DateTime(first(obx, 14)),
  });
}

/**
 * Results grouped by their order (OBR), with each OBX and any NTE comments
 * that follow it. OBX segments without a preceding OBR form a group of their own.
 */
export function readObservations(message: Hl7Message): ObservationGroup[] {
  const groups: ObservationGroup[] = [];
  let current: ObservationGroup | undefined;

  for (const segment of message.segments) {
    if (segment.name === "OBR") {
      current = compact({
        placerOrderNumber: first(segment, 2),
        fillerOrderNumber: first(segment, 3),
        test: coded(segment, 4),
        observedAt: parseHl7DateTime(first(segment, 7)),
        resultStatus: first(segment, 25),
        observations: [],
        notes: [],
      });
      groups.push(current);
    } else if (segment.name === "OBX") {
      if (!current) {
        current = { observations: [], notes: [] };
        groups.push(current);
      }
      current.observations.push(readObservation(segment));
    } else if (segment.name === "NTE" && current) {
      const text = (segment.fields[3] ?? []).map((rep) => rep[0]?.[0] ?? "").join("\n");
      if (text) current.notes.push(text);
    }
  }
  return groups;
}

export type Allergy = { type?: string; allergen?: CodedValue; severity?: string; reactions: string[] };

/** AL1 segments: allergy type, allergen, severity and reactions. */
export function readAllergies(message: Hl7Message): Allergy[] {
  return message.segmentsNamed("AL1").map((al1) =>
    compact({
      type: first(al1, 2),
      allergen: coded(al1, 3),
      severity: first(al1, 4),
      reactions: (al1.fields[5] ?? []).map((rep) => rep[0]?.[0] ?? "").filter(Boolean),
    }),
  );
}
