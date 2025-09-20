/**
 * MLLP (Minimal Lower Layer Protocol) framing used to send HL7 over TCP:
 *   <VT> message <FS><CR>   with VT = 0x0B, FS = 0x1C, CR = 0x0D.
 */
export const MLLP_START = 0x0b;
export const MLLP_END = 0x1c;
export const MLLP_TRAILER = 0x0d;

const encoder = new TextEncoder();

/** Wraps one HL7 message in an MLLP frame. */
export function frameMessage(message: string): Uint8Array {
  const body = encoder.encode(message);
  const frame = new Uint8Array(body.length + 3);
  frame[0] = MLLP_START;
  frame.set(body, 1);
  frame[body.length + 1] = MLLP_END;
  frame[body.length + 2] = MLLP_TRAILER;
  return frame;
}

/**
 * Incrementally extracts messages from a TCP byte stream. Chunks can split a
 * frame anywhere (including inside a multi-byte character), and one chunk can
 * hold several frames; bytes outside a frame are ignored.
 */
export class MllpDecoder {
  private buffer: number[] = [];
  private inFrame = false;
  private readonly decoder = new TextDecoder();

  /** Feeds bytes in and returns every message completed by them. */
  push(chunk: Uint8Array): string[] {
    const messages: string[] = [];
    for (let i = 0; i < chunk.length; i++) {
      const byte = chunk[i]!;
      if (!this.inFrame) {
        if (byte === MLLP_START) {
          this.inFrame = true;
          this.buffer = [];
        }
        continue;
      }
      if (byte === MLLP_START) {
        // A new frame started before the old one ended: drop the broken frame.
        this.buffer = [];
        continue;
      }
      if (byte === MLLP_END) {
        messages.push(this.decoder.decode(new Uint8Array(this.buffer)));
        this.buffer = [];
        this.inFrame = false;
        continue;
      }
      this.buffer.push(byte);
    }
    return messages;
  }

  /** True while a frame has started but not ended. */
  get pending(): boolean {
    return this.inFrame;
  }
}
