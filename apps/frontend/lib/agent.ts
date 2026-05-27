// Phase J.7 — Agent (API wallet) lifecycle.
//
// An "agent" is an ephemeral EOA generated client-side. The user signs a
// one-time `approveAgent` action with their main wallet to register the
// agent address with HL. After that, every L1 action (order, cancel) can be
// signed by the agent privkey directly — no MetaMask popup, no chain switch.
//
// Storage: IndexedDB (same-origin only, larger than localStorage, never
// transmitted, survives reloads). Key per (mainAddress, network) so the same
// browser can hold separate agents for testnet vs mainnet.
//
// Security model (see specs/.../contracts/agent.md):
// - HL's approveAgent grants the agent trade/cancel rights ONLY. The agent
//   privkey can NOT withdraw funds or change account settings.
// - Privkey is stored plaintext in IndexedDB. Encrypting client-side with a
//   key that the same JS can decrypt would only add obfuscation — the real
//   threat is XSS, which the CSP + dependency audit mitigates.
// - 30-day self-imposed expiry; HL itself doesn't expire agents.

import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import type { Hex } from 'viem';

export interface AgentRecord {
  /** secp256k1 private key, hex 0x prefixed. */
  privKey: Hex;
  /** Derived public address, lowercased. */
  address: `0x${string}`;
  /** Unix ms when this agent was created (drives 30-day expiry). */
  createdAt: number;
  /** Network the agent is registered on. */
  network: 'testnet' | 'mainnet';
  /** Main wallet that registered this agent. Lowercased. */
  mainAddress: `0x${string}`;
}

const DB_NAME = 'hl-markets-agent';
const DB_VERSION = 1;
const STORE = 'agent';
/** 30 days. After this we treat the agent as stale and force re-onboard. */
export const AGENT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function keyFor(mainAddress: string, network: 'testnet' | 'mainnet'): string {
  return `${mainAddress.toLowerCase()}:${network}`;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (): void => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = (): void => resolve(req.result);
    req.onerror = (): void => reject(req.error ?? new Error('IndexedDB open failed'));
  });
}

async function tx<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => Promise<T>,
): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const store = t.objectStore(STORE);
    let out: T;
    void fn(store)
      .then((v) => {
        out = v;
      })
      .catch((e) => {
        t.abort();
        reject(e);
      });
    t.oncomplete = (): void => resolve(out);
    t.onerror = (): void => reject(t.error ?? new Error('IDB tx failed'));
    t.onabort = (): void => reject(t.error ?? new Error('IDB tx aborted'));
  });
}

function reqAsPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = (): void => resolve(req.result);
    req.onerror = (): void => reject(req.error ?? new Error('IDB req failed'));
  });
}

/** Fetch the stored agent for (mainAddress, network), if any.
 *  Returns null when none, or when the stored record is past its 30-day expiry. */
export async function loadAgent(
  mainAddress: `0x${string}`,
  network: 'testnet' | 'mainnet',
): Promise<AgentRecord | null> {
  if (typeof indexedDB === 'undefined') return null;
  const key = keyFor(mainAddress, network);
  const rec = await tx('readonly', (s) => reqAsPromise<AgentRecord | undefined>(s.get(key)));
  if (!rec) return null;
  if (Date.now() - rec.createdAt > AGENT_MAX_AGE_MS) {
    // Past expiry — surface as "no agent" so the caller re-onboards.
    return null;
  }
  return rec;
}

/** Generate a fresh agent EOA and persist it. Does NOT call HL — the caller
 *  is responsible for `approveAgent` immediately after this. If the approve
 *  fails the caller MUST `deleteAgent` to keep IndexedDB clean. */
export async function generateAndStoreAgent(
  mainAddress: `0x${string}`,
  network: 'testnet' | 'mainnet',
): Promise<AgentRecord> {
  if (typeof indexedDB === 'undefined') {
    throw new Error('Agent flow requires IndexedDB (browser only).');
  }
  const privKey = generatePrivateKey();
  const account = privateKeyToAccount(privKey);
  const record: AgentRecord = {
    privKey,
    address: account.address.toLowerCase() as `0x${string}`,
    createdAt: Date.now(),
    network,
    mainAddress: mainAddress.toLowerCase() as `0x${string}`,
  };
  const key = keyFor(mainAddress, network);
  await tx('readwrite', async (s) => {
    await reqAsPromise(s.put(record, key));
    return undefined;
  });
  return record;
}

/** Remove the agent for (mainAddress, network). Idempotent. */
export async function deleteAgent(
  mainAddress: `0x${string}`,
  network: 'testnet' | 'mainnet',
): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  const key = keyFor(mainAddress, network);
  await tx('readwrite', async (s) => {
    await reqAsPromise(s.delete(key));
    return undefined;
  });
}

/** Wipe ALL agents (e.g. on hard logout from settings). */
export async function clearAllAgents(): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  await tx('readwrite', async (s) => {
    await reqAsPromise(s.clear());
    return undefined;
  });
}

/** Convenience: age of the agent in milliseconds, or null if no agent. */
export function ageMs(record: AgentRecord): number {
  return Date.now() - record.createdAt;
}

/** Convenience: how many ms until expiry; negative if expired. */
export function msUntilExpiry(record: AgentRecord): number {
  return AGENT_MAX_AGE_MS - ageMs(record);
}
