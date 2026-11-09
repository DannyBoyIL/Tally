import type { DocumentView, EventInput, Finding } from '@tally/shared';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.ts';
import { EditableValue } from '../components/EditableValue.tsx';
import { StatusBadge } from '../components/StatusBadge.tsx';
import {
  HEADER_FIELDS,
  LINE_COLUMNS,
  TOTAL_FIELDS,
  VENDOR_FIELDS,
  type FieldDef,
  type FieldKind,
  type FieldValue,
} from '../fields.ts';
import { FLAG_LABELS } from '../labels.ts';
import { formatMoney } from '../money.ts';
import { navigate } from '../router.ts';

type Act = (event: EventInput) => Promise<void>;

/** One entry per flag and field; a flag raised for several reasons lists them all. */
function groupFindings(findings: Finding[]) {
  const groups = new Map<string, { key: string; flag: Finding['flag']; reasons: string[] }>();
  for (const f of findings) {
    const key = `${f.flag}|${f.field ?? ''}`;
    const group = groups.get(key) ?? { key, flag: f.flag, reasons: [] };
    group.reasons.push(f.reason);
    groups.set(key, group);
  }
  return [...groups.values()];
}

function valueAt(source: unknown, path: string): FieldValue {
  let node = source;
  for (const key of path.split('.')) node = (node as Record<string, unknown> | null)?.[key];
  return (node ?? null) as FieldValue;
}

function show(kind: FieldKind, value: FieldValue, currency: string | null): string {
  if (value === null) return '—';
  if (kind === 'money' && typeof value === 'number') return formatMoney(value, currency);
  // Stored compact, shown in groups of four as printed.
  if (kind === 'iban') return String(value).replace(/(.{4})(?=.)/g, '$1 ');
  return String(value);
}

export function ReviewPage({ id }: { id: string }) {
  const [view, setView] = useState<DocumentView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get(id).then(setView, (e: Error) => setError(e.message));
  }, [id]);

  const act: Act = useCallback(
    async (event) => {
      setView(await api.act(id, event));
    },
    [id],
  );

  if (error)
    return (
      <main className="page">
        <p className="alert error" role="alert">
          {error}
        </p>
      </main>
    );
  if (!view)
    return (
      <main className="page">
        <p className="muted">Loading…</p>
      </main>
    );

  const final = view.final;
  const readOnly = view.status !== 'needs_review' || final === null;
  const byField = new Map<string, Finding[]>();
  for (const f of view.findings)
    if (f.field) byField.set(f.field, [...(byField.get(f.field) ?? []), f]);
  const documentFindings = view.findings.filter((f) => !f.field);

  const field = (def: FieldDef) => (
    <FieldRow
      key={def.path}
      def={def}
      view={view}
      findings={byField.get(def.path) ?? []}
      readOnly={readOnly}
      act={act}
    />
  );

  return (
    <main className="page review">
      <div className="page-header">
        <div>
          <a
            href="/"
            className="back"
            onClick={(e) => {
              e.preventDefault();
              navigate('/');
            }}
          >
            ← Queue
          </a>
          <h1>{view.filename}</h1>
          <p className="muted">
            Extracted by {view.extraction.model} · prompt {view.extraction.promptVersion}
          </p>
        </div>
        <StatusBadge status={view.status} />
      </div>

      <div className="review-grid">
        <DocumentImage id={view.id} filename={view.filename} />

        <div className="review-panel">
          <section className="card" aria-labelledby="checks">
            <h2 id="checks">Checks</h2>
            {view.extraction.error && (
              <p className="alert error">Extraction failed: {view.extraction.error}</p>
            )}
            {final && view.findings.length === 0 && <p className="alert ok">All checks passed.</p>}
            <ul className="findings" aria-label="Findings">
              {groupFindings(view.findings).map((g) => (
                <li key={g.key} className="finding">
                  <strong>{FLAG_LABELS[g.flag]}</strong>
                  {g.flag === 'injection_suspected' ? (
                    // The notice itself is quoted once, below; here only why it looks suspicious.
                    <span>{g.reasons.map((r) => r.split(': "')[0]).join(' · ')}</span>
                  ) : (
                    g.reasons.map((reason) => <span key={reason}>{reason}</span>)
                  )}
                </li>
              ))}
            </ul>
            {documentFindings.length > 0 && view.extraction.notices.length > 0 && (
              <div className="notices">
                <h3>Text in the document addressed to the reader</h3>
                <p className="muted">
                  Reported by the model, never acted on. Verify with the vendor through a known
                  channel before paying.
                </p>
                <ul>
                  {view.extraction.notices.map((n) => (
                    <li key={n}>
                      <q>{n}</q>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          {final && (
            <>
              <section className="card" aria-labelledby="details">
                <h2 id="details">Details</h2>
                <dl className="fields">{[...HEADER_FIELDS, ...VENDOR_FIELDS].map(field)}</dl>
              </section>

              <section className="card" aria-labelledby="lines">
                <h2 id="lines">Line items</h2>
                <table className="lines">
                  <thead>
                    <tr>
                      {LINE_COLUMNS.map((c) => (
                        <th key={c.key} className={c.key === 'description' ? '' : 'n'}>
                          {c.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {final.lineItems.map((_, i) => (
                      <tr key={i}>
                        {LINE_COLUMNS.map((c) => {
                          const path = `lineItems.${i}.${c.key}`;
                          const findings = byField.get(path) ?? [];
                          const edited = view.editedFields.includes(path);
                          const value = valueAt(final, path);
                          return (
                            <td
                              key={c.key}
                              className={[
                                c.key === 'description' ? '' : 'n',
                                findings.length ? 'flagged' : '',
                                edited ? 'edited' : '',
                              ].join(' ')}
                              title={findings.map((f) => f.reason).join('\n') || undefined}
                            >
                              <EditableValue
                                label={`Line ${i + 1} ${c.label}`}
                                kind={c.kind}
                                value={value}
                                display={show(c.kind, value, final.currency)}
                                readOnly={readOnly}
                                onSave={(v) => act({ type: 'edit', field: path, value: v })}
                              />
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
                <dl className="fields totals">{TOTAL_FIELDS.map(field)}</dl>
              </section>
            </>
          )}

          <Decision view={view} act={act} />
          <History view={view} />
        </div>
      </div>
    </main>
  );
}

function FieldRow({
  def,
  view,
  findings,
  readOnly,
  act,
}: {
  def: FieldDef;
  view: DocumentView;
  findings: Finding[];
  readOnly: boolean;
  act: Act;
}) {
  const value = valueAt(view.final, def.path);
  const original = valueAt(view.extraction.invoice, def.path);
  const currency = view.final?.currency ?? null;
  const edited = view.editedFields.includes(def.path);
  return (
    <div className={`field${findings.length ? ' flagged' : ''}${edited ? ' edited' : ''}`}>
      <dt>{def.label}</dt>
      <dd>
        <EditableValue
          label={def.label}
          kind={def.kind}
          value={value}
          display={show(def.kind, value, currency)}
          readOnly={readOnly}
          onSave={(v) => act({ type: 'edit', field: def.path, value: v })}
        />
        {edited && <span className="was">extracted: {show(def.kind, original, currency)}</span>}
        {findings.map((f, i) => (
          <span key={i} className="field-flag">
            {f.reason}
          </span>
        ))}
      </dd>
    </div>
  );
}

function DocumentImage({ id, filename }: { id: string; filename: string }) {
  const [zoomed, setZoomed] = useState(false);
  return (
    <figure className={`document${zoomed ? ' zoomed' : ''}`}>
      <button type="button" className="button small zoom" onClick={() => setZoomed(!zoomed)}>
        {zoomed ? 'Fit' : 'Zoom'}
      </button>
      <div className="document-scroll">
        <img src={api.imageUrl(id)} alt={`Uploaded document ${filename}`} />
      </div>
    </figure>
  );
}

function Decision({ view, act }: { view: DocumentView; act: Act }) {
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (view.status !== 'needs_review') {
    const decision = view.events.findLast((e) => e.type !== 'edit');
    return (
      <section className={`card decided status-${view.status}`} aria-label="Decision">
        <strong>{view.status === 'approved' ? 'Approved' : 'Rejected'}</strong> by{' '}
        {decision?.reviewer}
        {decision?.note && <> — “{decision.note}”</>}
      </section>
    );
  }

  const open = view.findings.length > 0 || view.final === null;
  const canApprove = view.final !== null && (view.findings.length === 0 || note.trim() !== '');

  async function decide(event: EventInput) {
    setBusy(true);
    setError(null);
    try {
      await act(event);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const trimmed = note.trim() || undefined;
  return (
    <section className="card" aria-labelledby="decision">
      <h2 id="decision">Decision</h2>
      <label className="note">
        Note{' '}
        {open
          ? '(required: explain why the flags are acceptable, or why you reject)'
          : '(optional)'}
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
      </label>
      {error && (
        <p className="alert error" role="alert">
          {error}
        </p>
      )}
      <div className="actions">
        <button
          type="button"
          className="button primary"
          disabled={busy || !canApprove}
          onClick={() => void decide({ type: 'approve', note: trimmed })}
        >
          Approve
        </button>
        <button
          type="button"
          className="button danger"
          disabled={busy || !trimmed}
          onClick={() => trimmed && void decide({ type: 'reject', note: trimmed })}
        >
          Reject
        </button>
      </div>
    </section>
  );
}

function History({ view }: { view: DocumentView }) {
  const currency = view.final?.currency ?? null;
  const fmt = (field: string | null, v: unknown) => {
    const isMoney = field !== null && /(subtotal|tax|total|unitPrice|amount)$/.test(field);
    return show(isMoney ? 'money' : 'text', v as FieldValue, currency);
  };
  return (
    <section className="card" aria-labelledby="history">
      <h2 id="history">History</h2>
      <ol className="history">
        <li>
          <span className="muted">{new Date(view.extraction.createdAt).toLocaleString()}</span>{' '}
          Extracted by {view.extraction.model}
        </li>
        {view.events.map((e) => (
          <li key={e.id}>
            <span className="muted">{new Date(e.createdAt).toLocaleString()}</span> {e.reviewer}{' '}
            {e.type === 'edit' ? (
              <>
                changed <code>{e.field}</code> from {fmt(e.field, e.oldValue)} to{' '}
                {fmt(e.field, e.newValue)}
              </>
            ) : (
              <>
                {e.type === 'approve' ? 'approved' : 'rejected'}
                {e.note && <> — “{e.note}”</>}
              </>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
