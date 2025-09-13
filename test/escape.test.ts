import { describe, expect, it } from "vitest";

import { DEFAULT_DELIMITERS as D, Hl7ParseError, readDelimiters } from "../src/encoding.js";
import { escapeValue, unescapeValue } from "../src/escape.js";

describe("readDelimiters", () => {
  it("reads the standard delimiters", () => {
    expect(readDelimiters("MSH|^~\\&|APP")).toEqual(D);
  });

  it("handles an MSH segment that ends right after the encoding characters", () => {
    expect(readDelimiters("MSH|^~\&")).toEqual(D);
  });

  it("supports custom delimiters", () => {
    expect(readDelimiters("MSH#$*@%#APP")).toEqual({
      field: "#",
      component: "$",
      repetition: "*",
      escape: "@",
      subcomponent: "%",
    });
  });

  it("rejects messages that don't start with MSH, or have bad encoding characters", () => {
    expect(() => readDelimiters("PID|1")).toThrow(Hl7ParseError);
    expect(() => readDelimiters("MSH|^~|APP")).toThrow(/four encoding characters/);
    expect(() => readDelimiters("MSH|^^\\&|APP")).toThrow(/different/);
  });
});

describe("unescapeValue", () => {
  it("decodes delimiter escapes", () => {
    expect(unescapeValue("A\\F\\B\\S\\C\\T\\D\\R\\E\\E\\", D)).toBe("A|B^C&D~E\\");
  });

  it("decodes line breaks and UTF-8 hex sequences", () => {
    expect(unescapeValue("line one\\.br\\line two", D)).toBe("line one\nline two");
    expect(unescapeValue("caf\\XC3A9\\", D)).toBe("café");
  });

  it("drops formatting escapes and keeps unknown ones verbatim", () => {
    expect(unescapeValue("\\H\\Bold\\N\\ text", D)).toBe("Bold text");
    expect(unescapeValue("custom \\Zabc\\ seq", D)).toBe("custom \\Zabc\\ seq");
  });

  it("leaves a lone escape character alone", () => {
    expect(unescapeValue("C:\\temp", D)).toBe("C:\\temp");
  });
});

describe("escapeValue", () => {
  it("escapes every delimiter and newline, and round-trips", () => {
    const original = "Na|K^Cl&HCO3~ratio\\x\nnext";
    const escaped = escapeValue(original, D);
    expect(escaped).toBe("Na\\F\\K\\S\\Cl\\T\\HCO3\\R\\ratio\\E\\x\\.br\\next");
    expect(unescapeValue(escaped, D)).toBe(original);
  });
});
