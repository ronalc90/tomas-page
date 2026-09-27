import { describe, expect, it } from "vitest";
import { initials, percent, relativeTime, splitLinks } from "../lib/format";
import { highlight } from "../lib/highlight";

describe("formatos", () => {
  it("formatea porcentajes sin separar el número del símbolo", () => {
    expect(percent(0.756)).toBe("76 %");
    expect(percent(null)).toBe("–");
  });

  it("saca iniciales", () => {
    expect(initials("Tomás Rodríguez")).toBe("TR");
    expect(initials("")).toBe("?");
  });

  it("describe tiempos relativos en español", () => {
    const now = new Date("2026-10-07T12:00:00Z");
    expect(relativeTime(null, now)).toBe("nunca");
    expect(relativeTime("2026-10-07T11:59:30Z", now)).toBe("hace un momento");
    expect(relativeTime("2026-10-06T12:00:00Z", now)).toBe("ayer");
  });

  it("detecta enlaces en la evidencia", () => {
    expect(splitLinks("mira https://github.com/tomas/x y listo")).toEqual([
      { text: "mira " },
      { text: "https://github.com/tomas/x", href: "https://github.com/tomas/x" },
      { text: " y listo" },
    ]);
  });

  it("resalta código y escapa HTML", () => {
    expect(highlight("print('<b>')", "python")).toContain("&lt;b&gt;");
    expect(highlight("SELECT 1;", "sql")).toContain("hljs-keyword");
  });
});
