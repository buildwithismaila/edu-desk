CREATE TYPE "public"."promotion_outcome" AS ENUM('promoted', 'repeated', 'graduated', 'withdrawn');--> statement-breakpoint
CREATE TABLE "promotion_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"from_session_id" uuid NOT NULL,
	"to_session_id" uuid NOT NULL,
	"class_arm_id" uuid NOT NULL,
	"promoted_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "promotion_runs_one_per_arm" UNIQUE("school_id","from_session_id","class_arm_id")
);
--> statement-breakpoint
CREATE TABLE "student_promotions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"from_session_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"from_class_arm_id" uuid NOT NULL,
	"outcome" "promotion_outcome" NOT NULL,
	"to_class_arm_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "student_promotions_one_per_session" UNIQUE("school_id","from_session_id","student_id")
);
--> statement-breakpoint
ALTER TABLE "promotion_runs" ADD CONSTRAINT "promotion_runs_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion_runs" ADD CONSTRAINT "promotion_runs_from_session_id_academic_sessions_id_fk" FOREIGN KEY ("from_session_id") REFERENCES "public"."academic_sessions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion_runs" ADD CONSTRAINT "promotion_runs_to_session_id_academic_sessions_id_fk" FOREIGN KEY ("to_session_id") REFERENCES "public"."academic_sessions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion_runs" ADD CONSTRAINT "promotion_runs_class_arm_id_class_arms_id_fk" FOREIGN KEY ("class_arm_id") REFERENCES "public"."class_arms"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion_runs" ADD CONSTRAINT "promotion_runs_promoted_by_id_users_id_fk" FOREIGN KEY ("promoted_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_promotions" ADD CONSTRAINT "student_promotions_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_promotions" ADD CONSTRAINT "student_promotions_run_id_promotion_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."promotion_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_promotions" ADD CONSTRAINT "student_promotions_from_session_id_academic_sessions_id_fk" FOREIGN KEY ("from_session_id") REFERENCES "public"."academic_sessions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_promotions" ADD CONSTRAINT "student_promotions_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_promotions" ADD CONSTRAINT "student_promotions_from_class_arm_id_class_arms_id_fk" FOREIGN KEY ("from_class_arm_id") REFERENCES "public"."class_arms"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_promotions" ADD CONSTRAINT "student_promotions_to_class_arm_id_class_arms_id_fk" FOREIGN KEY ("to_class_arm_id") REFERENCES "public"."class_arms"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "student_promotions_run_idx" ON "student_promotions" USING btree ("school_id","run_id");