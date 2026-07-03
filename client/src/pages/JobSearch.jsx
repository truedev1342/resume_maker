import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';

export default function JobSearch() {
  const [sites, setSites] = useState([]);
  const [newUrl, setNewUrl] = useState('');
  const [newName, setNewName] = useState('');
  const [siteError, setSiteError] = useState('');

  const [jobs, setJobs] = useState([]);
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [supported, setSupported] = useState([]);
  const [showSupported, setShowSupported] = useState(false);

  // filters
  const [q, setQ] = useState('');
  const [country, setCountry] = useState('');
  const [site, setSite] = useState('');
  const [role, setRole] = useState('');

  useEffect(() => {
    loadSites();
    loadJobs(false);
    api.get('/api/sites/supported').then((d) => setSupported(d.supported)).catch(() => {});
  }, []);

  async function loadSites() {
    try {
      const d = await api.get('/api/sites');
      setSites(d.sites);
    } catch {}
  }

  async function loadJobs(refresh) {
    setLoading(true);
    setMessage('');
    try {
      const d = await api.get(`/api/jobs${refresh ? '?refresh=1' : ''}`);
      setJobs(d.jobs || []);
      setSources(d.sources || []);
      if (d.message) setMessage(d.message);
    } catch (e) {
      setMessage(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function addSite(e) {
    e.preventDefault();
    setSiteError('');
    try {
      await api.post('/api/sites', { url: newUrl, name: newName });
      setNewUrl('');
      setNewName('');
      await loadSites();
      await loadJobs(true);
    } catch (e) {
      setSiteError(e.message);
    }
  }

  async function removeSite(id) {
    await api.del(`/api/sites/${id}`);
    await loadSites();
    await loadJobs(true);
  }

  const countries = useMemo(() => [...new Set(jobs.map((j) => j.country).filter(Boolean))].sort(), [jobs]);
  const roles = useMemo(() => [...new Set(jobs.map((j) => j.role).filter(Boolean))].sort(), [jobs]);
  const siteNames = useMemo(() => [...new Set(jobs.map((j) => j.site).filter(Boolean))].sort(), [jobs]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return jobs.filter((j) => {
      if (term && !`${j.title} ${j.company} ${j.role}`.toLowerCase().includes(term)) return false;
      if (country && j.country !== country) return false;
      if (site && j.site !== site) return false;
      if (role && j.role !== role) return false;
      return true;
    });
  }, [jobs, q, country, site, role]);

  return (
    <div>
      <div className="card">
        <div className="spread">
          <h2 style={{ margin: 0 }}>Job sites</h2>
          <button className="ghost" type="button" onClick={() => setShowSupported((s) => !s)}>
            {showSupported ? 'Hide supported sites' : 'What can I add?'}
          </button>
        </div>
        <p className="sub">
          Add boards to aggregate. Works best with supported platforms — aggregators (hiring.cafe, RemoteOK, Remotive,
          Arbeitnow), company boards (Greenhouse, Lever, Ashby, SmartRecruiters, Recruitee), and RSS feeds.
        </p>

        {showSupported && supported.length > 0 && (
          <div className="alert info" style={{ marginBottom: 14 }}>
            <table style={{ background: 'transparent' }}>
              <thead>
                <tr><th>Source</th><th>Type</th><th>Example URL</th><th></th></tr>
              </thead>
              <tbody>
                {supported.map((s) => (
                  <tr key={s.name}>
                    <td><b>{s.name}</b>{s.note && <div className="tiny muted">{s.note}</div>}</td>
                    <td><span className="pill">{s.kind}</span></td>
                    <td className="tiny" style={{ fontFamily: 'monospace' }}>{s.example}</td>
                    <td>
                      {!s.example.includes('{') && (
                        <button className="small secondary" type="button" onClick={() => { setNewUrl(s.example); setNewName(s.name); }}>
                          Use
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <form className="row" onSubmit={addSite}>
          <input
            placeholder="https://hiring.cafe"
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
            style={{ maxWidth: 360 }}
          />
          <input placeholder="Label (optional)" value={newName} onChange={(e) => setNewName(e.target.value)} style={{ maxWidth: 220 }} />
          <button type="submit">Add site</button>
        </form>
        {siteError && <div className="alert error" style={{ marginTop: 12 }}>{siteError}</div>}

        {sites.length > 0 && (
          <div className="row" style={{ marginTop: 14 }}>
            {sites.map((s) => {
              const src = sources.find((x) => x.siteId === s.id);
              return (
                <span key={s.id} className="pill" style={{ display: 'inline-flex', gap: 8, alignItems: 'center', padding: '6px 12px' }}>
                  <span title={s.url}>
                    {s.name}
                    {src && (src.ok ? ` · ${src.count}` : ' · ⚠')}
                  </span>
                  <button className="linklike" onClick={() => removeSite(s.id)} title="Remove">
                    ✕
                  </button>
                </span>
              );
            })}
          </div>
        )}
      </div>

      {sources.some((s) => !s.ok) && (
        <div className="card">
          <h2>Source status</h2>
          {sources.filter((s) => !s.ok).map((s) => (
            <div className="alert warn" key={s.siteId} style={{ marginBottom: 8 }}>
              <b>{s.name}:</b> {s.error}
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <div className="spread" style={{ marginBottom: 14 }}>
          <h2 style={{ margin: 0 }}>Jobs</h2>
          <div className="row">
            <span className="count">
              {filtered.length} of {jobs.length} jobs
            </span>
            <button className="secondary" onClick={() => loadJobs(true)} disabled={loading}>
              {loading ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </div>

        {message && <div className="alert info">{message}</div>}

        <div className="toolbar">
          <input placeholder="Search title / company / role…" value={q} onChange={(e) => setQ(e.target.value)} style={{ minWidth: 240 }} />
          <select value={country} onChange={(e) => setCountry(e.target.value)}>
            <option value="">All countries</option>
            {countries.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="">All roles</option>
            {roles.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
          <select value={site} onChange={(e) => setSite(e.target.value)}>
            <option value="">All sites</option>
            {siteNames.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          {(q || country || role || site) && (
            <button className="ghost" onClick={() => { setQ(''); setCountry(''); setRole(''); setSite(''); }}>
              Clear filters
            </button>
          )}
        </div>

        {filtered.length === 0 ? (
          <p className="muted">No jobs to show{jobs.length > 0 ? ' for these filters' : ''}.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Company</th>
                  <th>Country</th>
                  <th>Location</th>
                  <th>Salary</th>
                  <th>Role</th>
                  <th>Site</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((j) => (
                  <tr key={j.id}>
                    <td>{j.title || '—'}</td>
                    <td>{j.company || '—'}</td>
                    <td>{j.country || '—'}</td>
                    <td>{j.location || '—'}</td>
                    <td>{j.salary || '—'}</td>
                    <td>{j.role || '—'}</td>
                    <td className="tiny">{j.site}</td>
                    <td>
                      {j.url ? (
                        <a href={j.url} target="_blank" rel="noreferrer">
                          <button className="small">View</button>
                        </a>
                      ) : (
                        <span className="muted tiny">no link</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
