// Printed formats. Hand-rolled instead of Intl so output doesn't depend on the machine's ICU data.

export type MoneyStyle = 'symbol' | 'code' | 'eu';
export type DateStyle = 'iso' | 'long' | 'd-mon-y' | 'dmy-dots';

const SYMBOLS: Record<string, string> = { USD: '$', GBP: '£', EUR: '€' };
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function groupThousands(digits: string, separator: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, separator);
}

export function formatMoney(minor: number, currency: string, style: MoneyStyle): string {
  const sign = minor < 0 ? '-' : '';
  const abs = Math.abs(minor);
  const whole = String(Math.floor(abs / 100));
  const cents = String(abs % 100).padStart(2, '0');
  switch (style) {
    case 'symbol':
      return `${sign}${SYMBOLS[currency] ?? currency}${groupThousands(whole, ',')}.${cents}`;
    case 'code':
      return `${sign}${groupThousands(whole, ',')}.${cents} ${currency}`;
    case 'eu':
      return `${sign}${groupThousands(whole, '.')},${cents} ${SYMBOLS[currency] ?? currency}`;
  }
}

/** Plain amount without currency, for item columns. */
export function formatAmount(minor: number, style: MoneyStyle): string {
  const sign = minor < 0 ? '-' : '';
  const abs = Math.abs(minor);
  const whole = String(Math.floor(abs / 100));
  const cents = String(abs % 100).padStart(2, '0');
  return style === 'eu'
    ? `${sign}${groupThousands(whole, '.')},${cents}`
    : `${sign}${groupThousands(whole, ',')}.${cents}`;
}

export function formatQuantity(quantity: number, style: MoneyStyle): string {
  const text = String(quantity);
  return style === 'eu' ? text.replace('.', ',') : text;
}

export function formatDate(iso: string, style: DateStyle): string {
  const [year, month, day] = iso.split('-').map(Number) as [number, number, number];
  const monthName = MONTHS[month - 1] ?? '';
  switch (style) {
    case 'iso':
      return iso;
    case 'long':
      return `${monthName} ${day}, ${year}`;
    case 'd-mon-y':
      return `${day} ${monthName.slice(0, 3)} ${year}`;
    case 'dmy-dots':
      return `${String(day).padStart(2, '0')}.${String(month).padStart(2, '0')}.${year}`;
  }
}

export function formatPercent(rate: number): string {
  return `${Math.round(rate * 100_000) / 1000}%`;
}

export function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
