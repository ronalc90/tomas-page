/**
 * Traduce los errores de SQLite a una explicación clara en español.
 * La usan el laboratorio (en el navegador) y la calificación de ejercicios (en el servidor).
 */

interface Rule {
  pattern: RegExp;
  explain: (m: RegExpMatchArray) => string;
}

const q = (s: string) => `«${s}»`;

const RULES: Rule[] = [
  {
    pattern: /no such column: (.+)$/i,
    explain: (m) =>
      `La columna ${q(m[1])} no existe. Revisa cómo se escribe y en qué tabla está (el explorador de tablas muestra todas). Si es un texto, va entre comillas simples: 'así'.`,
  },
  {
    pattern: /no such table: (.+)$/i,
    explain: (m) => `La tabla ${q(m[1])} no existe. Revisa el nombre: en la Tienda las tablas van en plural y sin tildes (productos, clientes, pedidos…).`,
  },
  {
    pattern: /near "(.+?)": syntax error/i,
    explain: (m) =>
      `Error de sintaxis cerca de ${q(m[1])}. Revisa comas, comillas y paréntesis, y el orden de las cláusulas: SELECT, FROM, JOIN, WHERE, GROUP BY, HAVING, ORDER BY, LIMIT.`,
  },
  {
    pattern: /incomplete input/i,
    explain: () => "La consulta quedó incompleta: falta cerrar un paréntesis o una comilla, o termina a medias.",
  },
  {
    pattern: /unrecognized token: "(.+?)"/i,
    explain: (m) => `SQLite no entiende ${q(m[1])}. Suele ser una comilla sin cerrar o un carácter extraño copiado de otro lado.`,
  },
  {
    pattern: /ambiguous column name: (.+)$/i,
    explain: (m) =>
      `La columna ${q(m[1])} está en más de una de las tablas de la consulta. Escribe delante la tabla o su alias, por ejemplo p.${m[1].split(".").pop()}.`,
  },
  {
    pattern: /NOT NULL constraint failed: (.+)$/i,
    explain: (m) => `La columna ${q(m[1])} no puede quedar vacía (NOT NULL): dale un valor en el INSERT o en el UPDATE.`,
  },
  {
    pattern: /UNIQUE constraint failed: (.+)$/i,
    explain: (m) => `Ya existe una fila con ese valor en ${q(m[1])} y esa columna no admite repetidos (UNIQUE o clave primaria).`,
  },
  {
    pattern: /CHECK constraint failed: (.+)$/i,
    explain: (m) => `El valor no cumple la regla de la tabla (CHECK): ${m[1]}.`,
  },
  {
    pattern: /FOREIGN KEY constraint failed/i,
    explain: () =>
      "La fila apunta a un registro que no existe en la otra tabla (llave foránea), o intentas borrar un registro del que dependen otras filas.",
  },
  {
    pattern: /misuse of aggregate(?: function)?:? ?(\w+)?/i,
    explain: (m) =>
      `Usaste una función de agregación${m[1] ? ` (${m[1]})` : ""} donde no se permite, por ejemplo dentro de WHERE. Para filtrar por un total o un promedio usa HAVING después de GROUP BY.`,
  },
  {
    pattern: /misuse of window function/i,
    explain: () => "Las funciones de ventana (ROW_NUMBER, RANK, SUM … OVER) no se pueden usar en WHERE ni en GROUP BY. Calcúlala en una subconsulta o en un WITH y filtra afuera.",
  },
  {
    pattern: /a GROUP BY clause is required before HAVING/i,
    explain: () => "HAVING filtra grupos, así que necesita un GROUP BY antes. Si quieres filtrar filas, usa WHERE.",
  },
  {
    pattern: /no such function: (\w+)/i,
    explain: (m) => `La función ${q(m[1])} no existe en SQLite. Revisa el nombre; recuerda que SQLite no tiene todas las funciones de otros motores.`,
  },
  {
    pattern: /wrong number of arguments to function (\w+)/i,
    explain: (m) => `La función ${q(m[1])} recibió un número de argumentos que no es el correcto. Revisa las comas dentro de los paréntesis.`,
  },
  {
    pattern: /table (\S+) already exists/i,
    explain: (m) => `La tabla ${q(m[1])} ya existe. Usa CREATE TABLE IF NOT EXISTS, o bórrala primero con DROP TABLE.`,
  },
  {
    pattern: /table (\S+) has (\d+) columns but (\d+) values were supplied/i,
    explain: (m) => `La tabla ${q(m[1])} tiene ${m[2]} columnas pero diste ${m[3]} valores. Escribe la lista de columnas en el INSERT o completa los valores.`,
  },
  {
    pattern: /(\d+) values for (\d+) columns/i,
    explain: (m) => `Diste ${m[1]} valores para ${m[2]} columnas: la cantidad de valores debe coincidir con la lista de columnas del INSERT.`,
  },
  {
    pattern: /SELECTs to the left and right of (\w+(?: \w+)?) do not have the same number of result columns/i,
    explain: (m) => `Las dos consultas que une ${m[1]} deben devolver la misma cantidad de columnas.`,
  },
  {
    pattern: /sub-select returns (\d+) columns - expected 1/i,
    explain: (m) => `La subconsulta devuelve ${m[1]} columnas, pero ahí solo cabe una. Deja una sola columna en su SELECT.`,
  },
  {
    pattern: /(\d+)(?:st|nd|rd|th) ORDER BY term out of range/i,
    explain: (m) => `ORDER BY ${m[1]} se refiere a una columna que no existe en el SELECT (tiene menos columnas).`,
  },
  {
    pattern: /datatype mismatch/i,
    explain: () => "El tipo de dato no corresponde: por ejemplo, un texto en una columna INTEGER PRIMARY KEY.",
  },
  {
    pattern: /no tables specified/i,
    explain: () => "SELECT * necesita un FROM con la tabla de donde salen las columnas.",
  },
  {
    pattern: /row value misused/i,
    explain: () => "Hay paréntesis con varios valores donde se esperaba uno solo. Revisa los paréntesis de las condiciones.",
  },
  {
    pattern: /cannot (?:start|commit|rollback)|no transaction is active|within a transaction/i,
    explain: () => "Hay un problema con la transacción: revisa que cada BEGIN tenga su COMMIT o ROLLBACK, y que no haya uno de más.",
  },
  {
    pattern: /(?:no such index|index .+ already exists)/i,
    explain: () => "El índice no existe o ya existe con ese nombre.",
  },
  {
    pattern: /out of memory|too big/i,
    explain: () => "La consulta generó demasiados datos. Revisa que los JOIN tengan su condición ON y agrega un LIMIT mientras pruebas.",
  },
];

export interface SqlErrorExplanation {
  /** Explicación en español. */
  message: string;
  /** El mensaje original de SQLite. */
  original: string;
}

export function explainSqlError(raw: string): SqlErrorExplanation {
  const original = raw.replace(/^Error:\s*/, "").trim();
  for (const rule of RULES) {
    const m = original.match(rule.pattern);
    if (m) return { message: rule.explain(m), original };
  }
  return { message: "SQLite no pudo ejecutar la consulta. Lee el mensaje original: suele decir dónde está el problema.", original };
}

/** Mensaje de una línea: la explicación y, entre paréntesis, el original de SQLite. */
export function formatSqlError(raw: string): string {
  const e = explainSqlError(raw);
  return `${e.message} (SQLite: ${e.original})`;
}

export const SQL_TIMEOUT_MESSAGE =
  "La consulta tardó demasiado y se detuvo. Revisa que cada JOIN tenga su condición ON, que una consulta recursiva tenga cómo terminar, o agrega un LIMIT.";
