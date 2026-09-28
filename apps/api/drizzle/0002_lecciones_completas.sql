ALTER TABLE "day_progress" ADD COLUMN "challenge_done" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "days" ADD COLUMN "objectives" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "days" ADD COLUMN "steps" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "days" ADD COLUMN "common_errors" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "days" ADD COLUMN "task_hints" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "days" ADD COLUMN "challenge" jsonb;--> statement-breakpoint
ALTER TABLE "days" ADD COLUMN "glossary" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "days" ADD COLUMN "resources" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "deliverables" ADD COLUMN "steps" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "deliverables" ADD COLUMN "tips" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "deliverables" ADD COLUMN "stretch" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "deliverables" ADD COLUMN "checklist" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "type" text DEFAULT 'choice' NOT NULL;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "accepted" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "option_feedback" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "hint" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "quiz_attempts" ADD COLUMN "hints_used" jsonb DEFAULT '[]'::jsonb NOT NULL;