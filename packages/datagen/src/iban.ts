import type { Rng } from './random.ts';

// ISO 13616 check digits: move country + "00" to the end, letters become 10..35, then 98 - (n mod 97).
export function ibanCheckDigits(country: string, bban: string): string {
  const digits = (bban + country + '00').replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let remainder = 0;
  for (const d of digits) remainder = (remainder * 10 + Number(d)) % 97;
  return String(98 - remainder).padStart(2, '0');
}

export function makeIban(country: string, bban: string): string {
  return country + ibanCheckDigits(country, bban) + bban;
}

/** Printed form: groups of four. */
export function formatIban(iban: string): string {
  return iban.replace(/(.{4})/g, '$1 ').trim();
}

/** A different, checksum-valid IBAN with the same shape: what a fraudster would print. */
export function lookalikeIban(rng: Rng, iban: string): string {
  const country = iban.slice(0, 2);
  const bban = iban.slice(4);
  for (;;) {
    const fake = bban.replace(/\d/g, () => String(rng.int(0, 9)));
    const candidate = makeIban(country, fake);
    if (candidate !== iban) return candidate;
  }
}
