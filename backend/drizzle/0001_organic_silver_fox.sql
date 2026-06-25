CREATE TABLE "application_questions" (
	"question_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hackathon_id" uuid NOT NULL,
	"prompt" text NOT NULL,
	"type" varchar(20) DEFAULT 'short_text' NOT NULL,
	"options" jsonb,
	"required" boolean DEFAULT false NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_application_questions_type" CHECK ("application_questions"."type" in ('short_text', 'long_text', 'single_choice', 'multi_choice')),
	CONSTRAINT "chk_application_questions_options" CHECK ("application_questions"."type" in ('short_text', 'long_text') or "application_questions"."options" is not null)
);
--> statement-breakpoint
CREATE TABLE "question_answers" (
	"answer_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"answer" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "application_questions" ADD CONSTRAINT "application_questions_hackathon_id_hackathons_hackathon_id_fk" FOREIGN KEY ("hackathon_id") REFERENCES "public"."hackathons"("hackathon_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_answers" ADD CONSTRAINT "question_answers_application_id_applications_application_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("application_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_answers" ADD CONSTRAINT "question_answers_question_id_application_questions_question_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."application_questions"("question_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_application_questions_hackathon_id" ON "application_questions" USING btree ("hackathon_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_question_answers_application_question" ON "question_answers" USING btree ("application_id","question_id");--> statement-breakpoint
CREATE INDEX "idx_question_answers_application_id" ON "question_answers" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "idx_question_answers_question_id" ON "question_answers" USING btree ("question_id");