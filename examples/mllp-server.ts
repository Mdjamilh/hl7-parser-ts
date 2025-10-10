/**
 * A minimal HL7 listener: receives MLLP-framed messages over TCP, logs a
 * summary, and replies with an ACK (or AE when the message is invalid).
 *
 *   npx tsx examples/mllp-server.ts            # listens on 2575
 *   npx tsx examples/send.ts test/fixtures/oru_r01.hl7
 */
import net from "node:net";

import {
  createAck,
  frameMessage,
  Hl7Message,
  Hl7ParseError,
  MllpDecoder,
  parseMessage,
  readPatient,
  validateMessage,
} from "../src/index.js";

const PORT = Number(process.env.PORT ?? 2575);

function reply(raw: string): Hl7Message | undefined {
  try {
    const message = parseMessage(raw);
    const errors = validateMessage(message).filter((i) => i.severity === "error");
    const patient = readPatient(message);
    console.log(
      `${message.type.code}^${message.type.trigger} ${message.controlId ?? "?"}`,
      patient?.name ? `for ${patient.name.family}, ${patient.name.given}` : "",
    );
    return errors.length > 0
      ? createAck(message, { code: "AE", text: errors.map((e) => `${e.path} ${e.message}`).join("; ") })
      : createAck(message);
  } catch (error) {
    // Without a parseable MSH there's nothing to address an ACK to.
    console.error(error instanceof Hl7ParseError ? `Rejected: ${error.message}` : error);
    return undefined;
  }
}

net
  .createServer((socket) => {
    const decoder = new MllpDecoder();
    socket.on("data", (chunk) => {
      for (const raw of decoder.push(chunk)) {
        const ack = reply(raw);
        if (ack) socket.write(frameMessage(ack.toString()));
      }
    });
  })
  .listen(PORT, () => console.log(`MLLP listener on port ${PORT}`));
