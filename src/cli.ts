import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";

import { createAck, type AckCode } from "./ack.js";
import { Hl7ParseError } from "./encoding.js";
import { summarize, toSegmentJson } from "./json.js";
import { Hl7Message } from "./message.js";

const USAGE = `Usage: hl7 <command> [options] [file]

Reads an HL7 v2 message from FILE, or from stdin when FILE is omitted or "-".

Commands:
  parse [--summary] [--compact]   Print the message as JSON (segments by position, or a typed summary)
  get <path> [--all]              Print the value at a path, e.g. PID.5.1 or OBX.5 --all
  ack [--code AA|AE|AR] [--text]  Print an acknowledgment for the message
  validate                        Exit 0 if the message parses, 1 with the error otherwise

Examples:
  hl7 parse --summary lab-result.hl7
  cat adt.hl7 | hl7 get PID.3.1 --all`;

function readInput(file: string | undefined): string {
  return file && file !== "-" ? readFileSync(file, "utf8") : readFileSync(0, "utf8");
}

export function run(argv: string[], out = process.stdout, err = process.stderr): number {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      summary: { type: "boolean" },
      compact: { type: "boolean" },
      all: { type: "boolean" },
      code: { type: "string" },
      text: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });
  const [command, ...rest] = positionals;
  if (!command || values.help) {
    out.write(`${USAGE}\n`);
    return command || values.help ? 0 : 1;
  }

  const json = (value: unknown) => `${JSON.stringify(value, null, values.compact ? 0 : 2)}\n`;
  try {
    switch (command) {
      case "parse": {
        const message = Hl7Message.parse(readInput(rest[0]));
        out.write(json(values.summary ? summarize(message) : toSegmentJson(message)));
        return 0;
      }
      case "get": {
        const [path, file] = rest;
        if (!path) throw new Error("get needs a path, e.g. hl7 get PID.5.1 message.hl7");
        const message = Hl7Message.parse(readInput(file));
        const result = values.all ? message.getAll(path) : message.get(path);
        if (result === undefined) return 1;
        out.write(Array.isArray(result) ? `${result.join("\n")}\n` : `${result}\n`);
        return 0;
      }
      case "ack": {
        const code = (values.code ?? "AA").toUpperCase();
        if (!["AA", "AE", "AR"].includes(code)) throw new Error("--code must be AA, AE or AR");
        const message = Hl7Message.parse(readInput(rest[0]));
        const options = { code: code as AckCode, ...(values.text !== undefined && { text: values.text }) };
        out.write(`${createAck(message, options).toString().replaceAll("\r", "\n")}\n`);
        return 0;
      }
      case "validate": {
        const message = Hl7Message.parse(readInput(rest[0]));
        out.write(
          `OK: ${message.type.code ?? "?"}^${message.type.trigger ?? "?"} with ${message.segments.length} segments\n`,
        );
        return 0;
      }
      default:
        err.write(`Unknown command "${command}".\n\n${USAGE}\n`);
        return 1;
    }
  } catch (error) {
    err.write(`${error instanceof Hl7ParseError ? "Invalid HL7" : "Error"}: ${(error as Error).message}\n`);
    return 1;
  }
}
