import { makeIban } from './iban.ts';
import type { Rng } from './random.ts';

export type Country = 'US' | 'GB' | 'DE' | 'FR' | 'NL';

export interface CatalogItem {
  description: string;
  /** Unit price range in minor units. */
  price: [number, number];
  unit: 'each' | 'hours';
}

export interface VendorProfile {
  id: string;
  kind: 'invoice' | 'receipt';
  name: string;
  country: Country;
  currency: 'USD' | 'GBP' | 'EUR';
  taxId: string | null;
  iban: string | null;
  address: string[];
  phone: string;
  taxRate: number;
  invoiceNumber: (rng: Rng) => string;
  catalog: CatalogItem[];
}

/** What phase 3 checks extracted vendor data against. */
export interface VendorMasterRecord {
  id: string;
  name: string;
  taxId: string | null;
  iban: string | null;
}

const noNumber = (): string => '';

export const VENDORS: VendorProfile[] = [
  {
    id: 'northwind',
    kind: 'invoice',
    name: 'Northwind Office Supply',
    country: 'US',
    currency: 'USD',
    taxId: '84-2917365',
    iban: null,
    address: ['1450 Commerce Way, Suite 300', 'Columbus, OH 43215', 'United States'],
    phone: '+1 (614) 555-0142',
    taxRate: 0.0725,
    invoiceNumber: (rng) => `INV-2026-${rng.int(1000, 9999)}`,
    catalog: [
      { description: 'Copy paper, A4 (case of 10 reams)', price: [3899, 5299], unit: 'each' },
      { description: 'Toner cartridge, black', price: [6450, 11900], unit: 'each' },
      { description: 'Desk organizer', price: [1299, 2499], unit: 'each' },
      { description: 'Ballpoint pens (box of 50)', price: [899, 1599], unit: 'each' },
      { description: 'Ergonomic office chair', price: [18900, 34900], unit: 'each' },
      { description: 'Shipping & handling', price: [995, 2500], unit: 'each' },
    ],
  },
  {
    id: 'brightline',
    kind: 'invoice',
    name: 'Brightline Cloud Services',
    country: 'US',
    currency: 'USD',
    taxId: '47-5530218',
    iban: null,
    address: ['88 Market Street, Floor 12', 'San Francisco, CA 94105', 'United States'],
    phone: '+1 (415) 555-0199',
    taxRate: 0,
    invoiceNumber: (rng) => `BL-${rng.int(100000, 999999)}`,
    catalog: [
      { description: 'Cloud hosting, Standard plan (monthly)', price: [4900, 29900], unit: 'each' },
      { description: 'Additional storage (100 GB)', price: [1000, 2500], unit: 'each' },
      { description: 'Premium support', price: [9500, 15000], unit: 'hours' },
      { description: 'Onboarding workshop', price: [75000, 150000], unit: 'each' },
      { description: 'API overage (per 10k calls)', price: [200, 500], unit: 'each' },
    ],
  },
  {
    id: 'harbor-finch',
    kind: 'invoice',
    name: 'Harbor & Finch Legal LLP',
    country: 'US',
    currency: 'USD',
    taxId: '93-1048826',
    iban: null,
    address: ['200 Park Avenue South', 'New York, NY 10003', 'United States'],
    phone: '+1 (212) 555-0117',
    taxRate: 0,
    invoiceNumber: (rng) => String(rng.int(20000, 29999)),
    catalog: [
      { description: 'Contract review', price: [32500, 49500], unit: 'hours' },
      { description: 'Corporate filing fee', price: [15000, 45000], unit: 'each' },
      { description: 'Legal consultation', price: [25000, 35000], unit: 'hours' },
      { description: 'Courier service', price: [2500, 6000], unit: 'each' },
    ],
  },
  {
    id: 'thames-print',
    kind: 'invoice',
    name: 'Thames Valley Print Co. Ltd',
    country: 'GB',
    currency: 'GBP',
    taxId: 'GB284719356',
    iban: makeIban('GB', 'BARC20051773154421'),
    address: ['Unit 7, Kennet Business Park', 'Reading RG1 8QD', 'United Kingdom'],
    phone: '+44 118 496 0321',
    taxRate: 0.2,
    invoiceNumber: (rng) => `TVP-${rng.int(10000, 99999)}`,
    catalog: [
      { description: 'Business cards (500)', price: [2400, 4800], unit: 'each' },
      { description: 'A1 poster print', price: [1800, 3500], unit: 'each' },
      { description: 'Brochure, 8pp A4 (250 copies)', price: [21000, 38000], unit: 'each' },
      { description: 'Design proof revision', price: [4500, 6500], unit: 'hours' },
      { description: 'Delivery', price: [795, 1500], unit: 'each' },
    ],
  },
  {
    id: 'kestrel-it',
    kind: 'invoice',
    name: 'Kestrel IT Consulting Ltd',
    country: 'GB',
    currency: 'GBP',
    taxId: 'GB603118274',
    iban: makeIban('GB', 'LOYD30963441850267'),
    address: ['3rd Floor, 41 Spring Gardens', 'Manchester M2 2BG', 'United Kingdom'],
    phone: '+44 161 496 0874',
    taxRate: 0.2,
    invoiceNumber: (rng) => `K-${rng.int(2026001, 2026999)}`,
    catalog: [
      { description: 'Network audit', price: [8500, 12000], unit: 'hours' },
      { description: 'Microsoft 365 licence (monthly)', price: [1050, 2200], unit: 'each' },
      { description: 'Laptop setup & imaging', price: [6500, 9500], unit: 'each' },
      { description: 'Managed backup service', price: [15000, 30000], unit: 'each' },
      { description: 'On-site support', price: [7500, 9500], unit: 'hours' },
    ],
  },
  {
    id: 'rheinwerk',
    kind: 'invoice',
    name: 'Rheinwerk Industrietechnik GmbH',
    country: 'DE',
    currency: 'EUR',
    taxId: 'DE287341926',
    iban: makeIban('DE', '500105175407324931'),
    address: ['Hafenstraße 42', '40213 Düsseldorf', 'Germany'],
    phone: '+49 211 5550 3172',
    taxRate: 0.19,
    invoiceNumber: (rng) => `RW-26/${rng.int(1000, 9999)}`,
    catalog: [
      { description: 'Hydraulic hose assembly', price: [4500, 12000], unit: 'each' },
      { description: 'Ball bearing 6204-2RS (pack of 10)', price: [2800, 5200], unit: 'each' },
      { description: 'Maintenance visit', price: [8500, 11000], unit: 'hours' },
      { description: 'Pressure sensor PS-200', price: [18500, 26000], unit: 'each' },
      { description: 'Freight', price: [2500, 9000], unit: 'each' },
    ],
  },
  {
    id: 'atelier-lumiere',
    kind: 'invoice',
    name: 'Atelier Lumière SARL',
    country: 'FR',
    currency: 'EUR',
    taxId: 'FR40303265045',
    iban: makeIban('FR', '30006000011234567890189'),
    address: ['14 Rue des Arts', '69002 Lyon', 'France'],
    phone: '+33 4 72 55 01 88',
    taxRate: 0.2,
    invoiceNumber: (rng) => `F${rng.int(2026000, 2026999)}`,
    catalog: [
      { description: 'Photography session (half day)', price: [45000, 90000], unit: 'each' },
      { description: 'Photo retouching', price: [4500, 6500], unit: 'hours' },
      { description: 'Fine art print 40×50 cm', price: [6500, 12000], unit: 'each' },
      { description: 'Travel expenses', price: [3500, 15000], unit: 'each' },
    ],
  },
  {
    id: 'van-der-berg',
    kind: 'invoice',
    name: 'Van der Berg Logistics B.V.',
    country: 'NL',
    currency: 'EUR',
    taxId: 'NL853746219B01',
    iban: makeIban('NL', 'ABNA0417164300'),
    address: ['Waalhaven Z.z. 19', '3089 JH Rotterdam', 'Netherlands'],
    phone: '+31 10 555 2290',
    taxRate: 0.21,
    invoiceNumber: (rng) => `VDB${rng.int(100000, 999999)}`,
    catalog: [
      { description: 'Pallet storage (per week)', price: [450, 900], unit: 'each' },
      { description: 'FTL transport Rotterdam–Antwerp', price: [65000, 98000], unit: 'each' },
      { description: 'Customs clearance', price: [8500, 15000], unit: 'each' },
      { description: 'Handling fee', price: [1500, 4500], unit: 'each' },
      { description: 'Fuel surcharge', price: [2000, 7500], unit: 'each' },
    ],
  },
  {
    id: 'corner-cafe',
    kind: 'receipt',
    name: 'Corner Cafe',
    country: 'US',
    currency: 'USD',
    taxId: null,
    iban: null,
    address: ['512 Elm St', 'Austin, TX 78701'],
    phone: '(512) 555-0163',
    taxRate: 0.0825,
    invoiceNumber: noNumber,
    catalog: [
      { description: 'Latte', price: [450, 575], unit: 'each' },
      { description: 'Croissant', price: [325, 425], unit: 'each' },
      { description: 'Avocado toast', price: [950, 1250], unit: 'each' },
      { description: 'Cold brew', price: [425, 525], unit: 'each' },
      { description: 'Blueberry muffin', price: [350, 425], unit: 'each' },
    ],
  },
  {
    id: 'metro-hardware',
    kind: 'receipt',
    name: 'Metro Hardware & Supply',
    country: 'US',
    currency: 'USD',
    taxId: null,
    iban: null,
    address: ['2200 W Division St', 'Chicago, IL 60622'],
    phone: '(773) 555-0148',
    taxRate: 0.1025,
    invoiceNumber: noNumber,
    catalog: [
      { description: 'Wood screws (box)', price: [699, 999], unit: 'each' },
      { description: 'Paint roller kit', price: [1499, 1999], unit: 'each' },
      { description: 'LED bulb 4-pack', price: [1199, 1599], unit: 'each' },
      { description: 'Duct tape', price: [649, 899], unit: 'each' },
      { description: 'Extension cord 25ft', price: [2499, 3299], unit: 'each' },
    ],
  },
  {
    id: 'greenleaf',
    kind: 'receipt',
    name: 'Greenleaf Grocers',
    country: 'GB',
    currency: 'GBP',
    taxId: 'GB771204583',
    iban: null,
    address: ['18 High Street', 'Bath BA1 5AW'],
    phone: '01225 496 012',
    taxRate: 0.2,
    invoiceNumber: noNumber,
    catalog: [
      { description: 'Sourdough loaf', price: [325, 450], unit: 'each' },
      { description: 'Free range eggs (6)', price: [210, 295], unit: 'each' },
      { description: 'Cheddar, mature 400g', price: [380, 520], unit: 'each' },
      { description: 'Orange juice 1L', price: [175, 260], unit: 'each' },
      { description: 'Coffee beans 250g', price: [599, 850], unit: 'each' },
    ],
  },
  {
    id: 'baeckerei-sonne',
    kind: 'receipt',
    name: 'Bäckerei Sonnenschein',
    country: 'DE',
    currency: 'EUR',
    taxId: 'DE314927560',
    iban: null,
    address: ['Lindenstraße 8', '50674 Köln'],
    phone: '0221 555 7731',
    taxRate: 0.07,
    invoiceNumber: noNumber,
    catalog: [
      { description: 'Rye bread', price: [380, 450], unit: 'each' },
      { description: 'Pretzel', price: [120, 160], unit: 'each' },
      { description: 'Apple strudel', price: [290, 350], unit: 'each' },
      { description: 'Filter coffee', price: [280, 340], unit: 'each' },
      { description: 'Cheese roll', price: [250, 320], unit: 'each' },
    ],
  },
];

export function vendorMasterData(): VendorMasterRecord[] {
  return VENDORS.map(({ id, name, taxId, iban }) => ({ id, name, taxId, iban }));
}

export interface Buyer {
  name: string;
  address: string[];
}

export const BUYERS: Buyer[] = [
  { name: 'Tally Demo Co.', address: ['77 Riverside Drive', 'Portland, OR 97201'] },
  { name: 'Meridian Analytics Ltd', address: ['5 Canal Wharf', 'Leeds LS11 5PS'] },
  { name: 'Osprey Retail Group', address: ['Keizersgracht 210', '1016 DZ Amsterdam'] },
];
