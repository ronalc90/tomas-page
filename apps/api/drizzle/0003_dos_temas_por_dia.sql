ALTER TABLE "days" ADD COLUMN "schedule" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "days" ADD COLUMN "topics" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "days" DROP COLUMN "concept";--> statement-breakpoint
ALTER TABLE "days" DROP COLUMN "tip";--> statement-breakpoint
ALTER TABLE "days" DROP COLUMN "example";--> statement-breakpoint
ALTER TABLE "days" DROP COLUMN "language";--> statement-breakpoint
ALTER TABLE "days" DROP COLUMN "example_output";--> statement-breakpoint
ALTER TABLE "days" DROP COLUMN "steps";--> statement-breakpoint
ALTER TABLE "days" DROP COLUMN "common_errors";
