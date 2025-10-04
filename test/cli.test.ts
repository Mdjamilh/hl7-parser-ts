import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { run } from "../src/cli.js";

const fixture = (name: string) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));

function exec(args: string[]) {
  let stdout = "";
  let stderr = "";
  const code = run(
    args,
    { write: (s: string) => ((stdout += s), true) } as never,
    { write: (s: string) => ((stderr += s), true) } as never,
  );
  return { code, stdout, stderr };
}

describe("hl7 CLI", () => {
  it("parses to positional JSON or a typed summary", () => {
    const raw = exec(["parse", fixture("adt_a01.hl7"), "--compact"]);
    expect(raw.code).toBe(0);
    expect(JSON.parse(raw.stdout)[0]).toMatchObject({ segment: "MSH" });

    const summary = JSON.parse(exec(["parse", "--summary", fixture("oru_r01.hl7")]).stdout);
    expect(summary.observations[0].observations[0]).toMatchObject({ value: 182, flags: ["H"] });
  });

  it("gets single and repeated values", () => {
    expect(exec(["get", "PID.5.1", fixture("adt_a01.hl7")]).stdout).toBe("DOE\n");
    expect(exec(["get", "OBX.3.2", "--all", fixture("oru_r01.hl7")]).stdout).toBe(
      "Glucose\nCreatinine\nPotassium\nComment\n",
    );
    expect(exec(["get", "ZZZ.1", fixture("adt_a01.hl7")]).code).toBe(1);
  });

  it("builds an ACK and validates input", () => {
    const ack = exec(["ack", "--code", "ae", "--text", "No bed", fixture("adt_a01.hl7")]);
    expect(ack.stdout).toMatch(/\nMSA\|AE\|MSG00001\|No bed\n$/);
    expect(exec(["validate", fixture("oru_r01.hl7")]).stdout).toBe("OK: ORU^R01 with 8 segments\n");
  });

  it("reports errors and usage", () => {
    expect(exec(["ack", "--code", "XX", fixture("adt_a01.hl7")])).toMatchObject({
      code: 1,
      stderr: expect.stringMatching(/AA, AE or AR/),
    });
    expect(exec(["frobnicate"])).toMatchObject({ code: 1, stderr: expect.stringMatching(/Unknown command/) });
    expect(exec([]).code).toBe(1);
    expect(exec(["--help"])).toMatchObject({ code: 0, stdout: expect.stringMatching(/^Usage: hl7/) });
  });
});
