import type { DocumentSummary } from '@tally/shared';
import { useEffect, useState } from 'react';
import { api } from '../api.ts';
import { StatusBadge } from '../components/StatusBadge.tsx';
import { formatMoney } from '../money.ts';
import { navigate } from '../router.ts';

export function QueuePage() {
  const [documents, setDocuments] = useState<DocumentSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    api.list().then(setDocuments, (e: Error) => setError(e.message));
  }, []);

  async function upload(file: File) {
    setUploading(true);
    setError(null);
    try {
      const view = await api.upload(file);
      navigate(`/documents/${view.id}`);
    } catch (e) {
      setError((e as Error).message);
      setUploading(false);
    }
  }

  return (
    <main className="page">
      <div className="page-header">
        <h1>Review queue</h1>
        <label className={`button primary${uploading ? ' disabled' : ''}`}>
          {uploading ? 'Extracting…' : 'Upload invoice'}
          <input
            type="file"
            accept="image/jpeg,image/png"
            className="visually-hidden"
            aria-label="Upload invoice image"
            disabled={uploading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void upload(file);
            }}
          />
        </label>
      </div>
      {error && (
        <p className="alert error" role="alert">
          {error}
        </p>
      )}
      {documents === null ? (
        <p className="muted">Loading…</p>
      ) : documents.length === 0 ? (
        <p className="empty">No documents yet. Upload an invoice or receipt image to start.</p>
      ) : (
        <table className="queue">
          <thead>
            <tr>
              <th>Document</th>
              <th>Vendor</th>
              <th className="n">Total</th>
              <th>Flags</th>
              <th>Status</th>
              <th>Uploaded</th>
            </tr>
          </thead>
          <tbody>
            {documents.map((d) => (
              <tr key={d.id} onClick={() => navigate(`/documents/${d.id}`)}>
                <td>
                  <a
                    href={`/documents/${d.id}`}
                    onClick={(e) => {
                      e.preventDefault();
                      navigate(`/documents/${d.id}`);
                    }}
                  >
                    {d.filename}
                  </a>
                </td>
                <td>{d.vendorName ?? <span className="muted">extraction failed</span>}</td>
                <td className="n">{d.total === null ? '—' : formatMoney(d.total, d.currency)}</td>
                <td>
                  {d.flagCount > 0 ? (
                    <span className="badge flag">{d.flagCount}</span>
                  ) : (
                    <span className="muted">none</span>
                  )}
                </td>
                <td>
                  <StatusBadge status={d.status} />
                </td>
                <td className="muted">{new Date(d.createdAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
