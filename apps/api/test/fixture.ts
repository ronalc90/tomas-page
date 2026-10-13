import path from "node:path";
import { fileURLToPath } from "node:url";

/** Plan de prueba pequeño en el formato nuevo: las pruebas no dependen del contenido real. */
export const FIXTURE_PLAN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../fixtures/plan.json");
