// Registry — Constitution V.
// Adding a new variant: import here + one entry.

import { outcome } from './outcome';
import { delisting } from './delisting';
import { unknown } from './unknown';
import type { Variant, VariantRenderer } from '../types';

export const renderers: Record<Variant, VariantRenderer> = {
  outcome,
  delisting,
  unknown,
};
