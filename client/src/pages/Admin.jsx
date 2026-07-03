import React, { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function Admin() {
  const [overview, setOverview] = useState(null);
  const [uploads, setUploads] = useState([]);
  const [resumes, setResumes] = useState([]);
  const [sites, setSites] = useState([]);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    const [o, u, r, s] = await Promise.all([
      api.get('/api/admin/overview'),
      api.get('/api/admin/uploads'),
      api.get('/api/admin/resumes'),
      api.get('/api/sites'),
    ]);
    setOverview(o);
    setUploads(u.uploads);
    setResumes(r.resumes);
    setSites(s.sites);
  }

  async function delUpload(id) {
    await api.del(`/api/admin/uploads/${id}`);
    loadAll();
  }
  async function delResume(id) {
    await api.del(`/api/admin/resumes/${id}`);
    loadAll();
  }
  async function delSite(id) {
    await api.del(`/api/admin/sites/${id}`);
    loadAll();
  }
  async function clearJobsCache() {
    await api.post('/api/admin/clear-jobs-cache');
    setMsg('Job aggregation cache cleared.');
  }

  if (!overview) return <div className="spinner">Loading admin…</div>;

  return (
    <div>
      <div className="card">
        <h2>Admin overview</h2>
        <p className="sub">Manage all users' uploads, generated resumes, and job sites. No database — everything is stored as files.</p>
        <div className="row" style={{ marginBottom: 8 }}>
          <div className="stat"><b>{overview.counts.uploads}</b><span>Uploads</span></div>
          <div className="stat"><b>{overview.counts.resumes}</b><span>Resumes</span></div>
          <div className="stat"><b>{overview.counts.sites}</b><span>Job sites</span></div>
          <div className="stat">
            <b>{overview.ai.anthropic ? 'Anthropic' : overview.ai.openai ? 'OpenAI' : 'Local'}</b>
            <span>AI engine</span>
          </div>
        </div>
        <p className="tiny muted">Uploads dir: {overview.storage.uploadsDir}</p>
        <p className="tiny muted">Generated dir: {overview.storage.generatedDir}</p>
        <div className="row" style={{ marginTop: 10 }}>
          <button className="secondary" onClick={clearJobsCache}>Clear job cache</button>
        </div>
        {msg && <div className="alert ok" style={{ marginTop: 12 }}>{msg}</div>}
      </div>

      <div className="card">
        <h2>Accounts</h2>
        <table>
          <thead><tr><th>Username</th><th>Name</th><th>Role</th></tr></thead>
          <tbody>
            {overview.accounts.map((a) => (
              <tr key={a.id}>
                <td>{a.username}</td>
                <td>{a.name}</td>
                <td><span className={`pill`}>{a.role}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="tiny muted" style={{ marginTop: 8 }}>Accounts are fixed (huy, tony, phan). huy has admin rights.</p>
      </div>

      <div className="card">
        <h2>All generated resumes ({resumes.length})</h2>
        {resumes.length === 0 ? <p className="muted">None yet.</p> : (
          <table>
            <thead><tr><th>Owner</th><th>Title</th><th>Job</th><th>Template</th><th>Engine</th><th>Created</th><th></th></tr></thead>
            <tbody>
              {resumes.map((r) => (
                <tr key={r.id}>
                  <td>{r.owner}</td>
                  <td>{r.title}</td>
                  <td>{r.jobTitle || '—'}</td>
                  <td><span className="pill">{r.templateId}</span></td>
                  <td className="tiny">{r.provider}</td>
                  <td className="tiny">{new Date(r.createdAt).toLocaleString()}</td>
                  <td className="row">
                    <a href={`/api/resumes/${r.id}/view`} target="_blank" rel="noreferrer">Open</a>
                    <button className="danger small" onClick={() => delResume(r.id)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h2>All uploaded resumes ({uploads.length})</h2>
        {uploads.length === 0 ? <p className="muted">None yet.</p> : (
          <table>
            <thead><tr><th>Owner</th><th>File</th><th>Size</th><th>Text</th><th>Uploaded</th><th></th></tr></thead>
            <tbody>
              {uploads.map((u) => (
                <tr key={u.id}>
                  <td>{u.owner}</td>
                  <td>{u.originalName}</td>
                  <td className="tiny">{Math.round((u.size || 0) / 1024)} KB</td>
                  <td>{u.textExtracted ? '✓' : '—'}</td>
                  <td className="tiny">{new Date(u.createdAt).toLocaleString()}</td>
                  <td><button className="danger small" onClick={() => delUpload(u.id)}>Delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h2>Job sites ({sites.length})</h2>
        {sites.length === 0 ? <p className="muted">None added.</p> : (
          <table>
            <thead><tr><th>Name</th><th>URL</th><th>Added by</th><th></th></tr></thead>
            <tbody>
              {sites.map((s) => (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td className="tiny"><a href={s.url} target="_blank" rel="noreferrer">{s.url}</a></td>
                  <td>{s.addedBy}</td>
                  <td><button className="danger small" onClick={() => delSite(s.id)}>Delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
