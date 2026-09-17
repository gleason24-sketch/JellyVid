/**
 * Pricing. One rate, every pack, no tiers and no subscriptions.
 *
 * Complaint #2 is that pricing moves under you and the annual plan is a trap.
 * The fix is arithmetic anyone can check: 1 credit = 1 cent, in every pack,
 * forever. A bigger pack buys more credits, never cheaper ones.
 */

export const CENTS_PER_CREDIT = 1;

export interface CreditPack {
  id: string;
  credits: number;
  priceCents: number;
  /** Plain-language yardstick so the number means something. */
  yardstick: string;
}

export const CREDIT_PACKS: CreditPack[] = [
  { id: 'pack-500', credits: 500, priceCents: 500, yardstick: '12 drafts, or 4 finished videos' },
  { id: 'pack-1000', credits: 1000, priceCents: 1000, yardstick: '25 drafts, or 8 finished videos' },
  { id: 'pack-2500', credits: 2500, priceCents: 2500, yardstick: '62 drafts, or 20 finished videos' },
  { id: 'pack-5000', credits: 5000, priceCents: 5000, yardstick: '125 drafts, or 41 finished videos' },
];

export function getPack(id: string): CreditPack | undefined {
  return CREDIT_PACKS.find((pack) => pack.id === id);
}

export function creditsToUsd(credits: number): string {
  return `$${((credits * CENTS_PER_CREDIT) / 100).toFixed(2)}`;
}

export function centsToUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/** Guards the promise: if any pack ever drifts off the flat rate, this fails. */
export function everyPackIsTheSameRate(): boolean {
  return CREDIT_PACKS.every((pack) => pack.priceCents === pack.credits * CENTS_PER_CREDIT);
}
