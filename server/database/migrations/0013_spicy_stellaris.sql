ALTER TABLE "attendance_registers" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "attendance_registers" ADD COLUMN "sent_late_at" timestamp with time zone;