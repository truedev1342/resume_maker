import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';

export default function Dashboard() {
  const { user } = useAuth();
  const [resumes, setResumes] = useState([]);
  const [health, setHealth] = useState(null);

  useEffect(() => {
    api.get('/api/resumes').then((d) => setResumes(d.resumes)).catch(() => {});
    api.get('/api/health').then(setHealth).catch(() => {});
  }, []);

  return (
    <div>
      <div className="card">
        <h2>Welcome, {user?.name} 👋</h2>
        <p className="sub">Build ATS-optimized resumes tailored to any job, and search across job boards you add.</p>
        <div className="row">
          <div className="stat">
            <b>{resumes.length}</b>
            <span>Your resumes</span>
          </div>
          {health && (
            <div className="stat">
              <b>{health.ai?.anthropic ? 'Anthropic' : health.ai?.openai ? 'OpenAI' : 'Local'}</b>
              <span>AI engine</span>
            </div>
          )}
        </div>
        {health?.ai?.fallbackOnly && (
          <div className="alert info" style={{ marginTop: 16 }}>
            No AI key is configured, so resume generation uses a local keyword-merge fallback. Add an{' '}
            <code>ANTHROPIC_API_KEY</code> (or <code>OPENAI_API_KEY</code>) in <code>.env</code> for full AI tailoring.
          </div>
        )}
      </div>

      <div className="grid2">
        <div className="card">
          <h2>📄 Resume Maker</h2>
          <p className="sub">Upload a sample resume or pick a template, paste a job link/description, and generate a tailored resume.</p>
          <Link to="/resume">
            <button>Create a resume</button>
          </Link>
        </div>
        <div className="card">
          <h2>🔎 Job Search</h2>
          <p className="sub">Add job sites (e.g. hiring.cafe, Greenhouse/Lever boards) and browse all listings with filters.</p>
          <Link to="/jobs">
            <button className="secondary">Search jobs</button>
          </Link>
        </div>
      </div>

      {resumes.length > 0 && (
        <div className="card">
          <h2>Recent resumes</h2>
          <table>
            <thead>
              <tr>
                <th>Title</th>
                <th>Job</th>
                <th>Template</th>
                <th>Engine</th>
                <th>Created</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {resumes.slice(0, 6).map((r) => (
                <tr key={r.id}>
                  <td>{r.title}</td>
                  <td>{r.jobTitle || '—'}</td>
                  <td><span className="pill">{r.templateId}</span></td>
                  <td className="tiny">{r.provider}</td>
                  <td className="tiny">{new Date(r.createdAt).toLocaleString()}</td>
                  <td>
                    <a href={`/api/resumes/${r.id}/view`} target="_blank" rel="noreferrer">
                      Open
                    </a>
                    {' · '}
                    <a href={`/api/resumes/${r.id}/pdf`}>PDF</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
