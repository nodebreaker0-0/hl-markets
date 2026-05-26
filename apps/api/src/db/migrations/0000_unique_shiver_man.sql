CREATE TABLE IF NOT EXISTS "governance" (
	"network" text NOT NULL,
	"gov_id" text NOT NULL,
	"action" jsonb NOT NULL,
	"variant" text NOT NULL,
	"inner_key" text,
	"expire_time" bigint NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"first_seen_at" bigint NOT NULL,
	"last_seen_at" bigint NOT NULL,
	"settled_at" bigint,
	CONSTRAINT "governance_network_gov_id_pk" PRIMARY KEY("network","gov_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "outcome_market" (
	"network" text NOT NULL,
	"outcome_id" bigint NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"side_specs" jsonb NOT NULL,
	"quote_token" text DEFAULT 'USDC' NOT NULL,
	"deploy_gov_id" text,
	"settle_gov_id" text,
	"asset_keys" jsonb NOT NULL,
	"status" text DEFAULT 'trading' NOT NULL,
	"winner_side" integer,
	"first_seen_at" bigint NOT NULL,
	"last_seen_at" bigint NOT NULL,
	"settled_at" bigint,
	CONSTRAINT "outcome_market_network_outcome_id_pk" PRIMARY KEY("network","outcome_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "poll_vote" (
	"network" text NOT NULL,
	"gov_id" text NOT NULL,
	"voter_addr" text NOT NULL,
	"side" text NOT NULL,
	"signature" text NOT NULL,
	"signed_at" bigint NOT NULL,
	"chain_id" bigint NOT NULL,
	"recovered_addr" text NOT NULL,
	"voter_stake" numeric(40, 0) DEFAULT '0' NOT NULL,
	"stored_at" bigint NOT NULL,
	CONSTRAINT "poll_vote_network_gov_id_voter_addr_pk" PRIMARY KEY("network","gov_id","voter_addr")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "validator_snapshot" (
	"network" text NOT NULL,
	"validator" text NOT NULL,
	"signer" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"stake" numeric(40, 0) NOT NULL,
	"is_active" boolean NOT NULL,
	"is_jailed" boolean NOT NULL,
	"commission" numeric(10, 8),
	"snapshot_ts" bigint NOT NULL,
	CONSTRAINT "validator_snapshot_network_validator_snapshot_ts_pk" PRIMARY KEY("network","validator","snapshot_ts")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vote_snapshot" (
	"network" text NOT NULL,
	"gov_id" text NOT NULL,
	"snapshot_ts" bigint NOT NULL,
	"voters" jsonb NOT NULL,
	"quorum_reached" boolean NOT NULL,
	CONSTRAINT "vote_snapshot_network_gov_id_snapshot_ts_pk" PRIMARY KEY("network","gov_id","snapshot_ts")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "governance_status_idx" ON "governance" USING btree ("network","status","expire_time");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "governance_variant_idx" ON "governance" USING btree ("network","variant");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "governance_first_seen_idx" ON "governance" USING btree ("first_seen_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "outcome_market_status_idx" ON "outcome_market" USING btree ("network","status","last_seen_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "outcome_market_deploy_gov_idx" ON "outcome_market" USING btree ("network","deploy_gov_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "outcome_market_settle_gov_idx" ON "outcome_market" USING btree ("network","settle_gov_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "poll_vote_gov_idx" ON "poll_vote" USING btree ("network","gov_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "validator_snapshot_latest_idx" ON "validator_snapshot" USING btree ("network","validator","snapshot_ts");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vote_snapshot_gov_idx" ON "vote_snapshot" USING btree ("network","gov_id","snapshot_ts");