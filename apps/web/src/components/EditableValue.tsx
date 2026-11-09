import { useState, type ReactNode } from 'react';
import { fromInput, toInput, type FieldKind, type FieldValue } from '../fields.ts';

interface Props {
  label: string;
  kind: FieldKind;
  value: FieldValue;
  display: ReactNode;
  readOnly: boolean;
  onSave: (value: FieldValue) => Promise<void>;
}

/** Shows a value; "Edit" turns it into an input. Enter saves, Escape cancels. */
export function EditableValue({ label, kind, value, display, readOnly, onSave }: Props) {
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (draft === null) {
    return (
      <span className="value">
        <span className="value-text">{display}</span>
        {!readOnly && (
          <button
            type="button"
            className="link-button"
            aria-label={`Edit ${label}`}
            onClick={() => {
              setDraft(toInput(kind, value));
              setError(null);
            }}
          >
            Edit
          </button>
        )}
      </span>
    );
  }

  async function save() {
    const parsed = fromInput(kind, draft ?? '');
    if ('error' in parsed) return setError(parsed.error);
    setSaving(true);
    try {
      await onSave(parsed.value);
      setDraft(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const cancel = () => {
    setDraft(null);
    setError(null);
  };
  const input =
    kind === 'documentType' ? (
      <select aria-label={label} value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus>
        <option value="invoice">invoice</option>
        <option value="receipt">receipt</option>
      </select>
    ) : (
      <input
        aria-label={label}
        type={kind === 'date' || kind === 'optionalDate' ? 'date' : 'text'}
        inputMode={kind === 'money' || kind === 'quantity' ? 'decimal' : undefined}
        value={draft}
        autoFocus
        onFocus={(e) => e.target.select()}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void save();
          if (e.key === 'Escape') cancel();
        }}
      />
    );

  return (
    <span className="value editing">
      {input}
      <button type="button" className="button small" disabled={saving} onClick={() => void save()}>
        Save
      </button>
      <button type="button" className="link-button" onClick={cancel}>
        Cancel
      </button>
      {error && (
        <span className="field-error" role="alert">
          {error}
        </span>
      )}
    </span>
  );
}
