// Heuristic over the notices the model reported (text addressed to the reader). It decides
// nothing about values; it only sends the document to a human. The patterns are generic invoice-
// fraud and prompt-injection red flags, not the golden set's exact wording, but they were written
// knowing that set: the live eval's false positives on clean documents keep them honest.

const RED_FLAGS: { pattern: RegExp; reason: string }[] = [
  {
    pattern: /\b(ignore|disregard|override)\b[^.]*\b(instruction|above|previous|prior)/i,
    reason: 'tells the reader to ignore something',
  },
  {
    pattern:
      /\b(AI|assistants?|LLMs?|language model|system instruction|automated (invoice )?(processing|processors?|systems?)|processors)\b/i,
    reason: 'addresses a machine reader',
  },
  { pattern: /^\s*\[[A-Z][A-Z0-9_-]*\]/, reason: 'formatted like a system message' },
  {
    pattern: /\bbank (details|account|information)\b[^.]*\b(changed|updated|new)\b/i,
    reason: 'announces changed bank details',
  },
  {
    // Not "pay by transfer to the account below": only a new or different destination.
    pattern:
      /\b(remit|pay|transfer)\b[^.]*\b(new|different|changed|updated|following)\b[^.]*\b(IBAN|account)\b|\bremit all payments\b/i,
    reason: 'redirects payment',
  },
  {
    pattern:
      /\b(revised|amended|corrected|updated|adjusted)\b[^.]*\b(amount|total|payable|balance|due)\b|\b(amount|total|payable|balance)\b[^.]*\b(revised|amended|corrected|adjusted)\b/i,
    reason: 'claims the amount changed',
  },
  {
    pattern:
      /\b(terms|due date|payment)\b[^.]*\b(extended|postponed|deferred)\b|\bnot due until\b/i,
    reason: 'claims the due date changed',
  },
  {
    pattern: /\b(already (been )?(settled|paid)|status\s*=\s*settled)\b/i,
    reason: 'claims it is settled',
  },
  {
    pattern: /\b(record|report|set|enter|use)\b[^.]*\bas the\b/i,
    reason: 'tells the reader what to record',
  },
];

export function injectionReasons(notices: readonly string[]): string[] {
  const reasons = new Set<string>();
  for (const notice of notices) {
    for (const { pattern, reason } of RED_FLAGS) {
      if (pattern.test(notice)) reasons.add(`${reason}: "${notice.slice(0, 120)}"`);
    }
  }
  return [...reasons];
}
