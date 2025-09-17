import { formatHl7DateTime } from "./datetime.js";
import { encodingCharacters } from "./encoding.js";
import { Hl7Message } from "./message.js";

/** AA = accepted, AE = application error, AR = application reject. */
export type AckCode = "AA" | "AE" | "AR";

export type AckOptions = {
  code?: AckCode;
  /** Human-readable text for MSA-3, usually set for AE/AR. */
  text?: string;
  /** Control id for the ACK itself; defaults to "ACK" + the original's. */
  controlId?: string;
  now?: Date;
};

/**
 * Builds the acknowledgment a receiver sends back: sender and receiver are
 * swapped, MSH-9 becomes ACK^<trigger>^ACK, and MSA echoes the original
 * control id so the sender can match the reply.
 */
export function createAck(original: Hl7Message, options: AckOptions = {}): Hl7Message {
  const { code = "AA", text, now = new Date() } = options;
  const d = original.delimiters;
  // Reply with the same delimiters the sender used.
  const ack = Hl7Message.parse(`MSH${d.field}${encodingCharacters(d)}`);

  const copy = (from: string, to: string) => {
    const value = original.get(from);
    if (value !== undefined) ack.set(to, value);
  };
  copy("MSH.5", "MSH.3");
  copy("MSH.6", "MSH.4");
  copy("MSH.3", "MSH.5");
  copy("MSH.4", "MSH.6");
  ack.set("MSH.7", formatHl7DateTime(now));
  ack.set("MSH.9.1", "ACK");
  const trigger = original.get("MSH.9.2");
  if (trigger) ack.set("MSH.9.2", trigger);
  ack.set("MSH.9.3", "ACK");
  ack.set("MSH.10", options.controlId ?? `ACK${original.controlId ?? ""}`.slice(0, 20));
  copy("MSH.11", "MSH.11");
  copy("MSH.12", "MSH.12");

  ack.set("MSA.1", code);
  ack.set("MSA.2", original.controlId ?? "");
  if (text) ack.set("MSA.3", text);
  return ack;
}
