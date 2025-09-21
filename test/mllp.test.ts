import { describe, expect, it } from "vitest";

import { frameMessage, MllpDecoder } from "../src/mllp.js";

const MSG_A = "MSH|^~\\&|A|B\rPID|1||42";
const MSG_B = "MSH|^~\\&|C|D\rNTE|1||café ☕";

const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
};

describe("frameMessage", () => {
  it("wraps the UTF-8 message in VT … FS CR", () => {
    const frame = frameMessage("AB");
    expect([...frame]).toEqual([0x0b, 0x41, 0x42, 0x1c, 0x0d]);
  });
});

describe("MllpDecoder", () => {
  it("decodes several frames from one chunk", () => {
    const decoder = new MllpDecoder();
    expect(decoder.push(concat(frameMessage(MSG_A), frameMessage(MSG_B)))).toEqual([MSG_A, MSG_B]);
    expect(decoder.pending).toBe(false);
  });

  it("reassembles a frame split byte by byte, including inside multi-byte characters", () => {
    const decoder = new MllpDecoder();
    const bytes = frameMessage(MSG_B);
    const out: string[] = [];
    for (const byte of bytes) out.push(...decoder.push(Uint8Array.of(byte)));
    expect(out).toEqual([MSG_B]);
  });

  it("ignores noise between frames and drops a frame interrupted by a new start byte", () => {
    const decoder = new MllpDecoder();
    const noise = new TextEncoder().encode("garbage");
    const broken = frameMessage("BROKEN").slice(0, 4);
    expect(decoder.push(concat(noise, broken, frameMessage(MSG_A), noise))).toEqual([MSG_A]);
  });

  it("reports a pending partial frame", () => {
    const decoder = new MllpDecoder();
    decoder.push(frameMessage(MSG_A).slice(0, 5));
    expect(decoder.pending).toBe(true);
  });
});
