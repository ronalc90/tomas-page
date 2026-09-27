import { desc, eq } from "drizzle-orm";
import type { ActivityItem } from "@tomas/shared";
import type { AppContext } from "../context";
import { activity, users } from "../db/schema";

export async function logActivity(
  ctx: AppContext,
  userId: string,
  type: string,
  ref: string | null = null,
  detail: Record<string, unknown> = {},
): Promise<void> {
  await ctx.db.insert(activity).values({ userId, type, ref, detail });
}

export async function recentActivity(ctx: AppContext, options: { userId?: string; limit?: number } = {}): Promise<ActivityItem[]> {
  const rows = await ctx.db
    .select({
      id: activity.id,
      type: activity.type,
      userId: activity.userId,
      userName: users.displayName,
      ref: activity.ref,
      detail: activity.detail,
      createdAt: activity.createdAt,
    })
    .from(activity)
    .innerJoin(users, eq(users.id, activity.userId))
    .where(options.userId ? eq(activity.userId, options.userId) : undefined)
    .orderBy(desc(activity.id))
    .limit(options.limit ?? 30);
  return rows;
}
