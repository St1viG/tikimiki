ALTER TABLE "member_skills" ADD COLUMN "source" varchar(20) DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "member_skills" ADD COLUMN "verified" boolean DEFAULT false NOT NULL;