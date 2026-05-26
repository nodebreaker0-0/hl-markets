// Single source of NEXT_PUBLIC_* env vars. Frontend code reads only via this.

export const BACKEND_URL: string =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:3001';

export const BUILD_TIME: string = process.env.NEXT_PUBLIC_BUILD_TIME ?? 'dev';
