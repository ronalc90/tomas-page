import type { Config } from "./config";
import type { Database } from "./db/client";
import { ExerciseService } from "./services/exercises";
import { PlanCache } from "./services/plan";
import { SqlRunner } from "./services/sqlRunner";
import { SettingsCache } from "./services/settings";
import { todayIn } from "@tomas/shared";

export interface AppContext {
  config: Config;
  db: Database;
  plan: PlanCache;
  settings: SettingsCache;
  /** Ejecuta SQL de los estudiantes con sql.js en un worker_thread. */
  sql: SqlRunner;
  exercises: ExerciseService;
  /** Fecha de hoy (AAAA-MM-DD) en la zona horaria del programa. */
  today: () => Promise<string>;
}

export function createContext(config: Config, db: Database): AppContext {
  const settings = new SettingsCache(db);
  const runner = new SqlRunner({ tiendaPath: config.tiendaSql });
  return {
    config,
    db,
    plan: new PlanCache(db),
    settings,
    sql: runner,
    exercises: new ExerciseService(db, runner),
    today: async () => config.fakeToday ?? todayIn((await settings.get()).timeZone),
  };
}
