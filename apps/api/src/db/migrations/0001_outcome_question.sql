CREATE TABLE IF NOT EXISTS "outcome_question" (
	"network" text NOT NULL,
	"question_id" bigint NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"named_outcomes" jsonb NOT NULL,
	"fallback_outcome" bigint NOT NULL,
	"settled_named_outcomes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'trading' NOT NULL,
	"first_seen_at" bigint NOT NULL,
	"last_seen_at" bigint NOT NULL,
	"settled_at" bigint,
	CONSTRAINT "outcome_question_network_question_id_pk" PRIMARY KEY("network","question_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "outcome_question_status_idx" ON "outcome_question" USING btree ("network","status","last_seen_at");
