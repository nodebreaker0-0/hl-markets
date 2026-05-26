CREATE TABLE IF NOT EXISTS "chat_session" (
	"id" text PRIMARY KEY NOT NULL,
	"address" text NOT NULL,
	"network" text NOT NULL,
	"nonce" text NOT NULL,
	"issued_at" bigint NOT NULL,
	"expires_at" bigint NOT NULL,
	"revoked_at" bigint,
	"last_seen_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "chat_session_nonce_uq" ON "chat_session" USING btree ("nonce");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_session_address_idx" ON "chat_session" USING btree ("address","expires_at");
