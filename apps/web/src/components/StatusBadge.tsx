import type { DocumentStatus } from '@tally/shared';
import { STATUS_LABELS } from '../labels.ts';

export function StatusBadge({ status }: { status: DocumentStatus }) {
  return <span className={`badge status-${status}`}>{STATUS_LABELS[status]}</span>;
}
