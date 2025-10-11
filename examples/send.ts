/**
 * Sends one HL7 file to an MLLP listener and prints the ACK.
 *   npx tsx examples/send.ts path/to/message.hl7 [host] [port]
 */
import { readFileSync } from "node:fs";
import net from "node:net";

import { frameMessage, MllpDecoder, parseMessage } from "../src/index.js";

const [file, host = "127.0.0.1", port = "2575"] = process.argv.slice(2);
if (!file) {
  console.error("Usage: npx tsx examples/send.ts <file.hl7> [host] [port]");
  process.exit(1);
}

const decoder = new MllpDecoder();
const socket = net.connect(Number(port), host, () => socket.write(frameMessage(readFileSync(file, "utf8"))));
socket.on("data", (chunk) => {
  for (const raw of decoder.push(chunk)) {
    const ack = parseMessage(raw);
    const original = ack.get("MSA.2") ?? "(no control id)";
    console.log(`ACK ${ack.get("MSA.1")} for ${original}${ack.get("MSA.3") ? `: ${ack.get("MSA.3")}` : ""}`);
    socket.end();
  }
});
socket.setTimeout(5000, () => {
  console.error("No ACK received within 5 seconds");
  socket.destroy();
  process.exitCode = 1;
});
