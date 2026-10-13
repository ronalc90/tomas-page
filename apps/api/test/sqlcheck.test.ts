import { describe, expect, it } from "vitest";
import { compareResults, explainSqlError, isDataChange, normalizeSqlValue, round2, type SqlResult } from "@tomas/shared";

const r = (columns: string[], rows: (string | number | null)[][]): SqlResult => ({ columns, rows });

describe("compareResults", () => {
  const expected = r(["nombre", "precio"], [
    ["Café", 6500],
    ["Hamaca", 32000],
    ["Taza", 4500],
  ]);

  it("acepta el mismo resultado aunque las columnas tengan otro nombre", () => {
    const res = compareResults(expected, r(["producto", "p"], expected.rows), false);
    expect(res).toMatchObject({ correct: true, message: "¡Correcto!" });
  });

  it("no exige orden de filas cuando el ejercicio no lo pide", () => {
    const res = compareResults(expected, r(["a", "b"], [...expected.rows].reverse()), false);
    expect(res.correct).toBe(true);
  });

  it("explica cuando hay columnas de más o de menos", () => {
    const res = compareResults(expected, r(["a", "b", "c"], expected.rows.map((x) => [...x, 1])), false);
    expect(res).toMatchObject({ correct: false, reason: "columns", message: "Tu consulta devuelve 3 columnas y se esperaban 2." });
    expect(compareResults(expected, r(["a"], [["x"]]), false).message).toBe("Tu consulta devuelve 1 columna y se esperaban 2.");
  });

  it("explica cuando la cantidad de filas no coincide", () => {
    const res = compareResults(expected, r(["a", "b"], expected.rows.slice(0, 1)), false);
    expect(res).toMatchObject({ reason: "rows", message: "Devuelve 1 fila y se esperaban 3." });
    const many = r(["a", "b"], Array.from({ length: 12 }, () => ["x", 1]));
    expect(compareResults(expected, many, false).message).toBe("Devuelve 12 filas y se esperaban 3.");
  });

  it("distingue filas correctas en otro orden cuando el orden importa", () => {
    const res = compareResults(expected, r(["a", "b"], [expected.rows[1], expected.rows[0], expected.rows[2]]), true);
    expect(res).toMatchObject({ correct: false, reason: "order", message: "Las filas son correctas pero el orden no: revisa ORDER BY." });
    expect(compareResults(expected, r(["a", "b"], expected.rows), true).correct).toBe(true);
  });

  it("señala la primera fila con valores distintos", () => {
    const rows = expected.rows.map((x) => [...x]);
    rows[2][1] = 4600;
    const res = compareResults(expected, r(["a", "b"], rows), false);
    expect(res).toMatchObject({ correct: false, reason: "values", row: 3, message: "Los valores no coinciden: revisa la fila 3." });
    const ordered = compareResults(expected, r(["a", "b"], rows), true);
    expect(ordered.row).toBe(3);
  });

  it("avisa cuando las columnas están en otro orden", () => {
    const res = compareResults(expected, r(["b", "a"], expected.rows.map(([a, b]) => [b, a])), false);
    expect(res.reason).toBe("column_order");
  });

  it("compara los decimales redondeados a 2 cifras y trata 2.0 igual que 2", () => {
    const exp = r(["x"], [[3.14159], [2]]);
    expect(compareResults(exp, r(["x"], [[3.14], [2.0]]), false).correct).toBe(true);
    expect(compareResults(exp, r(["x"], [[3.1], [2]]), false).correct).toBe(false);
  });

  it("distingue NULL, texto y número", () => {
    const exp = r(["x"], [[null], ["5"]]);
    expect(compareResults(exp, r(["x"], [[null], ["5"]]), false).correct).toBe(true);
    expect(compareResults(exp, r(["x"], [[null], [5]]), false).correct).toBe(false);
    expect(compareResults(exp, r(["x"], [[""], ["5"]]), false).correct).toBe(false);
  });

  it("respeta las filas repetidas", () => {
    const exp = r(["x"], [[1], [1], [2]]);
    expect(compareResults(exp, r(["x"], [[1], [2], [2]]), false).correct).toBe(false);
    expect(compareResults(exp, r(["x"], [[2], [1], [1]]), false).correct).toBe(true);
  });

  it("pide un SELECT cuando el SQL no devuelve filas", () => {
    expect(compareResults(expected, null, false).reason).toBe("no_result");
  });
});

describe("normalización", () => {
  it("redondea como round(x, 2) de Python", () => {
    expect(round2(0.125)).toBe(0.12);
    expect(round2(0.375)).toBe(0.38);
    expect(round2(-0.125)).toBe(-0.12);
    expect(round2(2.675)).toBe(2.67);
    expect(round2(1 / 3)).toBe(0.33);
    expect(round2(12500)).toBe(12500);
    expect(normalizeSqlValue(new Uint8Array([1, 255]))).toBe("01ff");
  });

  it("reconoce las sentencias que modifican datos", () => {
    expect(isDataChange("-- comentario\nUPDATE productos SET stock = 0")).toBe(true);
    expect(isDataChange("insert into x values (1)")).toBe(true);
    expect(isDataChange("SELECT * FROM productos")).toBe(false);
    expect(isDataChange("CREATE TABLE t (id INTEGER)")).toBe(false);
  });
});

describe("errores de SQLite en español", () => {
  it("traduce los errores más comunes", () => {
    expect(explainSqlError("no such column: nombres").message).toContain("La columna «nombres» no existe");
    expect(explainSqlError("no such table: producto").message).toContain("La tabla «producto» no existe");
    expect(explainSqlError('near "FORM": syntax error').message).toContain("Error de sintaxis cerca de «FORM»");
    expect(explainSqlError("ambiguous column name: id").message).toContain("está en más de una");
    expect(explainSqlError("NOT NULL constraint failed: productos.nombre").message).toContain("no puede quedar vacía");
    expect(explainSqlError("UNIQUE constraint failed: provincias.nombre").message).toContain("no admite repetidos");
    expect(explainSqlError("CHECK constraint failed: precio > 0").message).toContain("CHECK");
    expect(explainSqlError("FOREIGN KEY constraint failed").message).toContain("llave foránea");
    expect(explainSqlError("misuse of aggregate: COUNT()").message).toContain("HAVING");
    const unknown = explainSqlError("algo raro");
    expect(unknown.original).toBe("algo raro");
  });
});
