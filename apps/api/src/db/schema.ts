// Drizzle schemas — see specs/001-hl-markets/contracts/data-model.md.

import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

// ---- governance ---------------------------------------------------------

export const governance = pgTable(
  'governance',
  {
    network: text('network').notNull(),
    govId: text('gov_id').notNull(),
    action: jsonb('action').notNull(),
    variant: text('variant').notNull(),
    innerKey: text('inner_key'),
    expireTime: bigint('expire_time', { mode: 'bigint' }).notNull(),
    status: text('status').notNull().default('pending'),
    firstSeenAt: bigint('first_seen_at', { mode: 'bigint' }).notNull(),
    lastSeenAt: bigint('last_seen_at', { mode: 'bigint' }).notNull(),
    settledAt: bigint('settled_at', { mode: 'bigint' }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.network, t.govId] }),
    statusIdx: index('governance_status_idx').on(t.network, t.status, t.expireTime),
    variantIdx: index('governance_variant_idx').on(t.network, t.variant),
    firstSeenIdx: index('governance_first_seen_idx').on(t.firstSeenAt),
  }),
);

// ---- vote_snapshot ------------------------------------------------------

export const voteSnapshot = pgTable(
  'vote_snapshot',
  {
    network: text('network').notNull(),
    govId: text('gov_id').notNull(),
    snapshotTs: bigint('snapshot_ts', { mode: 'bigint' }).notNull(),
    voters: jsonb('voters').notNull(),
    quorumReached: boolean('quorum_reached').notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.network, t.govId, t.snapshotTs] }),
    govIdx: index('vote_snapshot_gov_idx').on(t.network, t.govId, t.snapshotTs),
  }),
);

// ---- validator_snapshot -------------------------------------------------

export const validatorSnapshot = pgTable(
  'validator_snapshot',
  {
    network: text('network').notNull(),
    validator: text('validator').notNull(),
    signer: text('signer').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    stake: numeric('stake', { precision: 40, scale: 0 }).notNull(),
    isActive: boolean('is_active').notNull(),
    isJailed: boolean('is_jailed').notNull(),
    commission: numeric('commission', { precision: 10, scale: 8 }),
    snapshotTs: bigint('snapshot_ts', { mode: 'bigint' }).notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.network, t.validator, t.snapshotTs] }),
    latestIdx: index('validator_snapshot_latest_idx').on(t.network, t.validator, t.snapshotTs),
  }),
);

// ---- outcome_market -----------------------------------------------------

export const outcomeMarket = pgTable(
  'outcome_market',
  {
    network: text('network').notNull(),
    outcomeId: bigint('outcome_id', { mode: 'number' }).notNull(),
    name: text('name').notNull(),
    description: text('description'),
    sideSpecs: jsonb('side_specs').notNull(),
    quoteToken: text('quote_token').notNull().default('USDC'),
    deployGovId: text('deploy_gov_id'),
    settleGovId: text('settle_gov_id'),
    assetKeys: jsonb('asset_keys').notNull(),
    status: text('status').notNull().default('trading'),
    winnerSide: integer('winner_side'),
    firstSeenAt: bigint('first_seen_at', { mode: 'bigint' }).notNull(),
    lastSeenAt: bigint('last_seen_at', { mode: 'bigint' }).notNull(),
    settledAt: bigint('settled_at', { mode: 'bigint' }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.network, t.outcomeId] }),
    statusIdx: index('outcome_market_status_idx').on(t.network, t.status, t.lastSeenAt),
    deployIdx: index('outcome_market_deploy_gov_idx').on(t.network, t.deployGovId),
    settleIdx: index('outcome_market_settle_gov_idx').on(t.network, t.settleGovId),
  }),
);

// ---- outcome_question (Polymarket-style multi-option, Phase H.3) --------
// HF outcomeMeta.questions describes a grouping of binary outcomes into one
// multi-option market. Once a question is resolved, HF removes it from
// outcomeMeta — so we mirror it here to keep historical questions visible.

export const outcomeQuestion = pgTable(
  'outcome_question',
  {
    network: text('network').notNull(),
    questionId: bigint('question_id', { mode: 'number' }).notNull(),
    name: text('name').notNull(),
    description: text('description'),
    /** Option outcomeIds in their declared order — JSON array of numbers. */
    namedOutcomes: jsonb('named_outcomes').notNull(),
    /** "None of the above" outcome id. */
    fallbackOutcome: bigint('fallback_outcome', { mode: 'number' }).notNull(),
    /** OutcomeIds resolved to Yes (usually exactly one once settled). */
    settledNamedOutcomes: jsonb('settled_named_outcomes').notNull().default([]),
    status: text('status').notNull().default('trading'),
    firstSeenAt: bigint('first_seen_at', { mode: 'bigint' }).notNull(),
    lastSeenAt: bigint('last_seen_at', { mode: 'bigint' }).notNull(),
    settledAt: bigint('settled_at', { mode: 'bigint' }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.network, t.questionId] }),
    statusIdx: index('outcome_question_status_idx').on(t.network, t.status, t.lastSeenAt),
  }),
);

// ---- chat_session (Phase J.1) -------------------------------------------
// EIP-712 sign-in audit + revoke table. JWT (issued as HttpOnly cookie) carries
// the `id` as `jti`; server checks `revoked_at IS NULL AND expires_at > now()`
// on every authenticated request.

export const chatSession = pgTable(
  'chat_session',
  {
    /** JWT jti — ULID generated server-side at sign-in. */
    id: text('id').primaryKey(),
    /** Lowercase 0x... — recovered from the EIP-712 signature. */
    address: text('address').notNull(),
    network: text('network').notNull(),
    /** One-time nonce issued by /auth/nonce, consumed on sign-in. */
    nonce: text('nonce').notNull(),
    issuedAt: bigint('issued_at', { mode: 'bigint' }).notNull(),
    expiresAt: bigint('expires_at', { mode: 'bigint' }).notNull(),
    revokedAt: bigint('revoked_at', { mode: 'bigint' }),
    lastSeenAt: bigint('last_seen_at', { mode: 'bigint' }).notNull(),
  },
  (t) => ({
    nonceUq: uniqueIndex('chat_session_nonce_uq').on(t.nonce),
    addressIdx: index('chat_session_address_idx').on(t.address, t.expiresAt),
  }),
);

// ---- chat_message (Phase J.2) -------------------------------------------
// One row per chat post. `market_key` is `q:<questionId>` or `o:<outcomeId>`.
// Soft-delete only; hard-delete happens in the retention cron 24h after the
// parent market settles.

export const chatMessage = pgTable(
  'chat_message',
  {
    /** ULID — sortable by time, used as the cursor for pagination. */
    id: text('id').primaryKey(),
    network: text('network').notNull(),
    marketKey: text('market_key').notNull(),
    /** Lowercase 0x... — copied from the session's address. */
    address: text('address').notNull(),
    body: text('body').notNull(),
    signedAt: bigint('signed_at', { mode: 'bigint' }).notNull(),
    deletedAt: bigint('deleted_at', { mode: 'bigint' }),
  },
  (t) => ({
    roomIdx: index('chat_message_room_idx').on(t.network, t.marketKey, t.id),
    addressIdx: index('chat_message_address_idx').on(t.address, t.signedAt),
  }),
);

// ---- chat_admin (Phase J.2) ---------------------------------------------
// Static allow-list of addresses that may delete *any* message (vs only their
// own). Seeded with builnad's EOA — see specs/contracts/data-model.md.

export const chatAdmin = pgTable('chat_admin', {
  address: text('address').primaryKey(), // lowercase 0x...
  note: text('note'),
  addedAt: bigint('added_at', { mode: 'bigint' }).notNull(),
});

// ---- poll_vote (Phase G) ------------------------------------------------

export const pollVote = pgTable(
  'poll_vote',
  {
    network: text('network').notNull(),
    govId: text('gov_id').notNull(),
    voterAddr: text('voter_addr').notNull(),
    side: text('side').notNull(),
    signature: text('signature').notNull(), // hex r||s||v
    signedAt: bigint('signed_at', { mode: 'bigint' }).notNull(),
    chainId: bigint('chain_id', { mode: 'bigint' }).notNull(),
    recoveredAddr: text('recovered_addr').notNull(),
    voterStake: numeric('voter_stake', { precision: 40, scale: 0 }).notNull().default('0'),
    storedAt: bigint('stored_at', { mode: 'bigint' }).notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.network, t.govId, t.voterAddr] }),
    govIdx: index('poll_vote_gov_idx').on(t.network, t.govId),
  }),
);
