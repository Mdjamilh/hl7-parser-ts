# hl7-parser-ts

[![CI](https://github.com/Mdjamilh/hl7-parser-ts/actions/workflows/ci.yml/badge.svg)](https://github.com/Mdjamilh/hl7-parser-ts/actions/workflows/ci.yml)

A small, zero-dependency library for reading and writing **HL7 v2** messages in TypeScript and JavaScript. HL7 v2 is the pipe-delimited format hospital systems still use to send admissions, lab results and orders to each other.

```
MSH|^~\&|LAB|GOODHEALTH|EHR|ANYTOWN|202603101330||ORU^R01^ORU_R01|LAB55821|P|2.5.1
PID|1||20007788^^^GOODHEALTH^MR||SMITH^ALEX^J||19720705|M
OBX|1|NM|2345-7^Glucose^LN||182|mg/dL|70-99|H|||F
```

```ts
import { parseMessage, readObservations } from "hl7-parser-ts";

const msg = parseMessage(text);
msg.get("PID.5.1"); // "SMITH"
msg.getAll("OBX.3.2"); // ["Glucose", ...]

readObservations(msg)[0].observations[0];
// { code: { code: "2345-7", text: "Glucose", system: "LN" }, value: 182, units: "mg/dL",
//   referenceRange: { low: 70, high: 99, text: "70-99" }, flags: ["H"], abnormal: true, ... }
```

- Works in Node 20+ and modern bundlers, as ESM or CommonJS, with type definitions included
- 7 kB gzipped, no runtime dependencies
- 54 tests, 99% line coverage, CI on Node 20, 22 and 24

## Install

```bash
npm install github:Mdjamilh/hl7-parser-ts
```

## What it handles

| | |
|---|---|
| **Delimiters** | Read from MSH-1/MSH-2, so non-standard delimiters work |
| **Escapes** | `\F\ \S\ \T\ \R\ \E\`, `\.br\` line breaks, `\Xhh\` UTF-8 hex, formatting codes |
| **Line endings** | `\r` (standard), `\n`, `\r\n`, a leading BOM, blank lines |
| **Round trips** | `toString()` reproduces the input byte for byte, re-escaping values |
| **Batches** | `parseBatch` splits FHS/BHS-wrapped files into messages |
| **Timestamps** | `parseHl7DateTime("20260310081530-0500")` → ISO text, precision and an exact `Date` when an offset is present |
| **Transport** | `frameMessage` and a streaming `MllpDecoder` for TCP (frames split across chunks, multi-byte characters, noise) |

## API

### Parsing and querying

Paths are 1-based like the spec: `SEGMENT[occurrence].FIELD[repetition].COMPONENT.SUBCOMPONENT`.

| Call | Returns |
|---|---|
| `parseMessage(text)` | `Hl7Message`; throws `Hl7ParseError` with the segment number on bad input |
| `msg.get("PID.5.1")` | First matching leaf value, or `undefined` if empty |
| `msg.get("OBX[3].5")` | Value from the third OBX |
| `msg.getAll("PID.3.1")` | Values across all repetitions (and all segments, for `OBX.5`) |
| `msg.getRaw("PID.5")` | The element re-encoded, e.g. `DOE^JANE^Q^^MS` |
| `msg.set("PID.5.2", "JANE")` | Sets a value, growing fields or appending the segment as needed |
| `msg.type`, `msg.controlId`, `msg.version` | MSH-9, MSH-10, MSH-12 |
| `msg.toString()` | ER7 text with `\r` between segments |

### Typed readers

| Function | Gives you |
|---|---|
| `readHeader(msg)` | Sending and receiving apps and facilities, timestamp, type, control id, version |
| `readPatient(msg)` | Identifiers with assigning authority and type, name parts, birth date, sex, address, phone |
| `readObservations(msg)` | Results grouped by OBR: numeric or text values, units, parsed reference ranges, abnormal flags, notes |
| `readAllergies(msg)` | AL1 allergen, type, severity, reactions |
| `summarize(msg)` | All of the above that apply, as one object |

### Replying and validating

```ts
import { createAck, validateMessage } from "hl7-parser-ts";

const issues = validateMessage(msg); // [{ severity: "error", path: "MSH.10", message: "..." }]
const ack = issues.some((i) => i.severity === "error")
  ? createAck(msg, { code: "AE", text: issues[0].message })
  : createAck(msg); // sender and receiver swapped, MSA echoes MSH-10
```

## Command line

```bash
npx hl7 parse --summary result.hl7      # typed JSON summary
npx hl7 parse result.hl7                # every field by position: { "PID.5": ["SMITH", "ALEX", "J"], ... }
npx hl7 get OBX.5 --all result.hl7      # one value per line
npx hl7 ack --code AE --text "No bed" adt.hl7
cat adt.hl7 | npx hl7 validate          # exit code 1 on errors
```

## Example: an HL7 listener

[`examples/mllp-server.ts`](examples/mllp-server.ts) is a 50-line TCP listener that parses each incoming message, validates it and replies with AA or AE. [`examples/send.ts`](examples/send.ts) sends a file to it.

```bash
npx tsx examples/mllp-server.ts
npx tsx examples/send.ts test/fixtures/oru_r01.hl7
# ACK AA for LAB55821
```

## Scope

This library reads and writes HL7 v2 syntax. It doesn't validate against message-structure definitions (which segments a given trigger event requires) or translate to FHIR. Those build on top of it.

## Development

```bash
npm install
npm test            # Vitest
npm run build       # tsup → dist/ (ESM, CJS, .d.ts)
npm run smoke       # installs the packed tarball in a temp project and uses it
```

The sample messages in `test/fixtures` are synthetic.

## License

[MIT](LICENSE)
