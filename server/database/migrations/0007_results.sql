CREATE TYPE "public"."result_status" AS ENUM('draft', 'submitted', 'published');--> statement-breakpoint
CREATE TABLE "published_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"term_id" uuid NOT NULL,
	"class_arm_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"report" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "published_results_one_per_student" UNIQUE("school_id","term_id","student_id")
);
--> statement-breakpoint
CREATE TABLE "result_statuses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"term_id" uuid NOT NULL,
	"class_arm_id" uuid NOT NULL,
	"status" "result_status" NOT NULL,
	"submitted_by_id" uuid,
	"submitted_at" timestamp with time zone,
	"published_by_id" uuid,
	"published_at" timestamp with time zone,
	"returned_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "result_statuses_one_per_arm" UNIQUE("school_id","term_id","class_arm_id")
);
--> statement-breakpoint
ALTER TABLE "term_comments" ADD COLUMN "principal_comment" text;--> statement-breakpoint
ALTER TABLE "term_comments" ADD COLUMN "principal_comment_by_id" uuid;--> statement-breakpoint
ALTER TABLE "published_results" ADD CONSTRAINT "published_results_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "published_results" ADD CONSTRAINT "published_results_term_id_terms_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."terms"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "published_results" ADD CONSTRAINT "published_results_class_arm_id_class_arms_id_fk" FOREIGN KEY ("class_arm_id") REFERENCES "public"."class_arms"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "published_results" ADD CONSTRAINT "published_results_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result_statuses" ADD CONSTRAINT "result_statuses_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result_statuses" ADD CONSTRAINT "result_statuses_term_id_terms_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."terms"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result_statuses" ADD CONSTRAINT "result_statuses_class_arm_id_class_arms_id_fk" FOREIGN KEY ("class_arm_id") REFERENCES "public"."class_arms"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result_statuses" ADD CONSTRAINT "result_statuses_submitted_by_id_users_id_fk" FOREIGN KEY ("submitted_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result_statuses" ADD CONSTRAINT "result_statuses_published_by_id_users_id_fk" FOREIGN KEY ("published_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "published_results_arm_idx" ON "published_results" USING btree ("school_id","term_id","class_arm_id");--> statement-breakpoint
ALTER TABLE "term_comments" ADD CONSTRAINT "term_comments_principal_comment_by_id_users_id_fk" FOREIGN KEY ("principal_comment_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;