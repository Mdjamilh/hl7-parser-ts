# Changelog

## 0.1.0

First release.

- Parse HL7 v2 (ER7) messages with delimiters read from MSH, escape-sequence decoding and tolerant line endings
- Query with 1-based paths: `get`, `getAll`, `getRaw`; edit with `set`
- Byte-exact serialization with re-escaping
- Typed readers for MSH, PID, OBR/OBX/NTE and AL1, plus a combined `summarize`
- HL7 timestamp parsing with precision and UTC offsets
- ACK generation, header validation and FHS/BHS batch parsing
- MLLP framing and a streaming decoder
- `hl7` command-line tool: `parse`, `get`, `ack`, `validate`
