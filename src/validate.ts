import { parseHl7DateTime } from "./datetime.js";
import type { Hl7Message } from "./message.js";

export type ValidationIssue = { severity: "error" | "warning"; path: string; message: string };

const PROCESSING_IDS = new Set(["P", "D", "T"]);

/**
 * Checks the header fields every receiver relies on. Parsing already
 * guarantees structure; this catches messages that parse but can't be routed
 * or acknowledged.
 */
export function validateMessage(message: Hl7Message): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const error = (path: string, text: string) => issues.push({ severity: "error", path, message: text });
  const warn = (path: string, text: string) => issues.push({ severity: "warning", path, message: text });

  if (!message.get("MSH.9.1")) error("MSH.9", "Message type is required (e.g. ADT^A01)");
  if (!message.get("MSH.10")) error("MSH.10", "Message control ID is required so the message can be acknowledged");
  const processing = message.get("MSH.11");
  if (!processing) error("MSH.11", "Processing ID is required (P, D or T)");
  else if (!PROCESSING_IDS.has(processing)) warn("MSH.11", `Unusual processing ID "${processing}"; expected P, D or T`);
  if (!message.get("MSH.12")) error("MSH.12", "Version ID is required (e.g. 2.5.1)");

  const sentAt = message.get("MSH.7");
  if (!sentAt) warn("MSH.7", "Message timestamp is missing");
  else if (!parseHl7DateTime(sentAt)) error("MSH.7", `"${sentAt}" is not a valid HL7 timestamp`);

  if (["ADT", "ORU", "ORM", "SIU"].includes(message.type.code ?? "") && !message.segment("PID")) {
    warn("PID", `${message.type.code} messages normally include a PID segment`);
  }
  return issues;
}
