import { useEffect, useState } from "react";
import { cleanEngine } from "./engine";
import type { SchemaTable } from "./protocol";

let cached: Promise<SchemaTable[]> | null = null;

/** Tablas y columnas de la Tienda (la base original), para el autocompletado de los ejercicios. */
export function useTiendaSchema(): SchemaTable[] {
  const [tables, setTables] = useState<SchemaTable[]>([]);
  useEffect(() => {
    let alive = true;
    cached ??= cleanEngine()
      .schema()
      .catch(() => {
        cached = null;
        return [];
      });
    void cached.then((t) => alive && setTables(t));
    return () => {
      alive = false;
    };
  }, []);
  return tables;
}
