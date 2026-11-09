// Money is integer cents everywhere; these are the only two places it becomes text and back.

export function formatMoney(cents: number, currency: string | null): string {
  const amount = cents / 100;
  try {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: currency ?? 'XXX',
    }).format(amount);
  } catch {
    // An unknown currency code (which the validators flag) still has to display.
    return `${amount.toFixed(2)} ${currency ?? ''}`.trim();
  }
}

/**
 * Reads what a reviewer types: "1,234.56", "1.234,56", "1234,5", "€ 12" → cents. The last
 * separator followed by one or two digits is the decimal point; any other is a thousands mark.
 * Returns null when it is not a number, or the separators are ambiguous: never guess an amount.
 */
export function parseMoney(input: string): number | null {
  const text = input.replace(/[^\d.,-]/g, '');
  if (!/\d/.test(text) || /-.*-|.-/.test(text)) return null;
  const decimal = /[.,](\d{1,2})$/.exec(text);
  const wholeText = decimal ? text.slice(0, decimal.index) : text;
  // Thousands marks group exactly three digits; "40.1555" is a typo, not forty thousand.
  if (!/^-?(\d+|\d{1,3}([.,]\d{3})+)?$/.test(wholeText)) return null;
  // One character can't be both the thousands mark and the decimal point ("12.345.6").
  const point = decimal ? text.charAt(decimal.index) : null;
  if (point && wholeText.includes(point)) return null;
  const whole = wholeText.replace(/[.,]/g, '');
  const cents = Number(`${whole || '0'}.${(decimal?.[1] ?? '0').padEnd(2, '0')}`) * 100;
  return Number.isFinite(cents) ? Math.round(cents) : null;
}
