import type { Config } from "./config";
import type { Database } from "./db/client";
import { PlanCache } from "./services/plan";
import { SettingsCache } from "./services/settings";
import { todayIn } from "@tomas/shared";

export interface AppContext {
  config: Config;
  db: Database;
  plan: PlanCache;
  settings: SettingsCache;
  /** Fecha de hoy (AAAA-MM-DD) en la zona horaria del programa. */
  today: () => Promise<string>;
}

export function createContext(config: Config, db: Database): AppContext {
  const settings = new SettingsCache(db);
  return {
    config,
    db,
    plan: new PlanCache(db),
    settings,
    today: async () => config.fakeToday ?? todayIn((await settings.get()).timeZone),
  };
}
