CREATE TABLE "hackathon_drafts" (
	"draft_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "application_questions" ADD COLUMN "allow_other" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "hackathon_drafts" ADD CONSTRAINT "hackathon_drafts_organization_id_organizations_user_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_hackathon_drafts_organization_id" ON "hackathon_drafts" USING btree ("organization_id");