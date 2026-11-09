// The API contract between apps/api and apps/web: one definition, both sides type-checked.
import { z } from 'zod';
import type { Flag } from './flags.ts';
import type { Invoice } from './invoice.ts';

/** A validator finding. `field` is the path it concerns (e.g. "total", "lineItems.2.amount"). */
export interface Finding {
  flag: Flag;
  reason: string;
  field?: string;
}

export type DocumentStatus = 'needs_review' | 'approved' | 'rejected';

export interface DocumentSummary {
  id: string;
  filename: string;
  createdAt: string;
  status: DocumentStatus;
  vendorName: string | null;
  total: number | null;
  currency: string | null;
  flagCount: number;
}

export interface ReviewEvent {
  id: string;
  type: 'edit' | 'approve' | 'reject';
  field: string | null;
  oldValue: unknown;
  newValue: unknown;
  note: string | null;
  reviewer: string;
  createdAt: string;
}

export interface DocumentView {
  id: string;
  filename: string;
  createdAt: string;
  status: DocumentStatus;
  extraction: {
    id: string;
    model: string;
    promptVersion: string;
    /** What the model returned, normalized. Never changes. */
    invoice: Invoice | null;
    notices: string[];
    error: string | null;
    createdAt: string;
  };
  /** The extraction with every edit applied, in order. */
  final: Invoice | null;
  /** Validators re-run on `final`. */
  findings: Finding[];
  /** Fields a reviewer changed, with their current value. */
  editedFields: string[];
  events: ReviewEvent[];
}

const value = z.union([z.string(), z.number(), z.null()]);

/** What a reviewer can do. Money values are integer cents, as everywhere else. */
export const EventInput = z.discriminatedUnion('type', [
  z.object({ type: z.literal('edit'), field: z.string().min(1), value }),
  z.object({ type: z.literal('approve'), note: z.string().trim().min(1).optional() }),
  z.object({ type: z.literal('reject'), note: z.string().trim().min(1) }),
]);
export type EventInput = z.infer<typeof EventInput>;
