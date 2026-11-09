/** One row of vendor master data: what the business already knows about a supplier. */
export interface VendorRecord {
  id: string;
  name: string;
  taxId: string | null;
  iban: string | null;
}

const compact = (s: string): string => s.normalize('NFC').replace(/\s+/g, '').toUpperCase();
const name = (s: string): string =>
  s
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

/**
 * Tax ID first (unique, hard to misread into another vendor's), then the name with punctuation
 * and case ignored ("Co." and "Co" are the same company).
 */
export function findVendor(
  vendors: readonly VendorRecord[],
  printed: { name: string; taxId: string | null },
): VendorRecord | null {
  const { taxId } = printed;
  if (taxId) {
    const byTaxId = vendors.find((v) => v.taxId && compact(v.taxId) === compact(taxId));
    if (byTaxId) return byTaxId;
  }
  return vendors.find((v) => name(v.name) === name(printed.name)) ?? null;
}
