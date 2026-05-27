// Barrel — UI code imports from '@/lib/signing'.
// lib/signing/* has zero React/Next dependencies; it is loaded by golden tests
// from plain Node.

export * from './types';
export { serialize, toHex, fromHex } from './serialize';
export { actionHash } from './actionHash';
export { phantomAgent } from './phantomAgent';
export { l1Payload } from './l1Payload';
export { typedDataHashes } from './typedDataHashes';
export type { TypedDataHashes } from './typedDataHashes';
export { submitExchange, SubmitNetworkError, SubmitHttpError } from './submit';
export type { SubmitArgs } from './submit';
