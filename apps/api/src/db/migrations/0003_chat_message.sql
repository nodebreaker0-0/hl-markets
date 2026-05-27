CREATE TABLE IF NOT EXISTS "chat_message" (
	"id" text PRIMARY KEY NOT NULL,
	"network" text NOT NULL,
	"market_key" text NOT NULL,
	"address" text NOT NULL,
	"body" text NOT NULL,
	"signed_at" bigint NOT NULL,
	"deleted_at" bigint
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_message_room_idx" ON "chat_message" USING btree ("network","market_key","id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_message_address_idx" ON "chat_message" USING btree ("address","signed_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "chat_admin" (
	"address" text PRIMARY KEY NOT NULL,
	"note" text,
	"added_at" bigint NOT NULL
);
