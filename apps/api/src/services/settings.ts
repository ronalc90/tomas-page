import type { PublicSettings } from "@tomas/shared";
import { settings } from "../db/schema";
import { DEFAULT_SETTINGS } from "../db/seed";
import type { Database } from "../db/client";

const TTL_MS = 30_000;

export class SettingsCache {
  private value: PublicSettings | null = null;
  private loadedAt = 0;

  constructor(private readonly db: Database) {}

  async get(): Promise<PublicSettings> {
    if (this.value && Date.now() - this.loadedAt < TTL_MS) return this.value;
    const rows = await this.db.select().from(settings);
    const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    this.value = {
      passScore: typeof map.passScore === "number" ? map.passScore : DEFAULT_SETTINGS.passScore,
      timeZone: typeof map.timeZone === "string" ? map.timeZone : DEFAULT_SETTINGS.timeZone,
      programName: typeof map.programName === "string" ? map.programName : DEFAULT_SETTINGS.programName,
    };
    this.loadedAt = Date.now();
    return this.value;
  }

  async update(values: Partial<Pick<PublicSettings, "passScore" | "programName">>): Promise<PublicSettings> {
    for (const [key, value] of Object.entries(values)) {
      await this.db.insert(settings).values({ key, value }).onConflictDoUpdate({ target: settings.key, set: { value } });
    }
    this.value = null;
    return this.get();
  }
}
