// Installs the packed tarball into a temp project and uses it the way a
// consumer would: ESM import, CommonJS require, and the hl7 binary.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, encoding: "utf8", shell: process.platform === "win32" });

const tarball = run(npm, ["pack", "--silent"], root).trim().split("\n").at(-1);
const dir = mkdtempSync(path.join(tmpdir(), "hl7-smoke-"));
writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "smoke", private: true }));
run(npm, ["install", "--silent", path.join(root, tarball)], dir);

const message = readFileSync(path.join(root, "test/fixtures/adt_a01.hl7"), "utf8");
writeFileSync(path.join(dir, "msg.hl7"), message);

writeFileSync(
  path.join(dir, "esm.mjs"),
  `import { parseMessage } from "hl7-parser-ts";
import { readFileSync } from "node:fs";
console.log(parseMessage(readFileSync("msg.hl7", "utf8")).get("PID.5.1"));`,
);
writeFileSync(
  path.join(dir, "cjs.cjs"),
  `const { parseMessage } = require("hl7-parser-ts");
console.log(parseMessage(require("node:fs").readFileSync("msg.hl7", "utf8")).get("PID.5.2"));`,
);

const checks = [
  ["ESM import", run("node", ["esm.mjs"], dir).trim(), "DOE"],
  ["CommonJS require", run("node", ["cjs.cjs"], dir).trim(), "JANE"],
  [
    "hl7 binary",
    run("node", [path.join(dir, "node_modules/hl7-parser-ts/dist/bin.js"), "validate", "msg.hl7"], dir).trim(),
    "OK: ADT^A01 with 6 segments",
  ],
];
let failed = false;
for (const [name, actual, expected] of checks) {
  const ok = actual === expected;
  failed ||= !ok;
  console.log(`${ok ? "pass" : "FAIL"}  ${name}: ${actual}`);
}
run(
  process.platform === "win32" ? "cmd" : "rm",
  process.platform === "win32" ? ["/c", "del", tarball] : ["-f", tarball],
  root,
);
process.exit(failed ? 1 : 0);
