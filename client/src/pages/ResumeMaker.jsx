import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';

export default function ResumeMaker() {
  const [templates, setTemplates] = useState([]);
  const [templateId, setTemplateId] = useState('classic');

  // base resume source
  const [uploads, setUploads] = useState([]);
  const [uploadId, setUploadId] = useState('');
  const [uploadMsg, setUploadMsg] = useState(null);
  const fileRef = useRef();

  // job input
  const [mode, setMode] = useState('url'); // 'url' | 'text'
  const [jobUrl, setJobUrl] = useState('');
  const [jobText, setJobText] = useState('');
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState(null);
  const [job, setJob] = useState(null);

  // generation
  const [customPrompt, setCustomPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState(null);
  const [genError, setGenError] = useState(null);

  useEffect(() => {
    api.get('/api/templates').then((d) => setTemplates(d.templates)).catch(() => {});
    refreshUploads();
  }, []);

  function refreshUploads() {
    api.get('/api/resumes/uploads').then((d) => setUploads(d.uploads)).catch(() => {});
  }

  async function onUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadMsg(null);
    const fd = new FormData();
    fd.append('resume', file);
    try {
      const d = await api.upload('/api/resumes/upload', fd);
      refreshUploads();
      setUploadId(d.upload.id);
      setUploadMsg(
        d.textExtracted
          ? { type: 'ok', text: `Uploaded "${d.upload.originalName}" and read its text.` }
          : { type: 'warn', text: `Uploaded "${d.upload.originalName}", but text couldn't be extracted: ${d.parseError || 'unknown reason'}. You can still generate from a sample.` }
      );
    } catch (e) {
      setUploadMsg({ type: 'error', text: e.message });
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function parse() {
    setParsing(true);
    setParseError(null);
    setJob(null);
    try {
      const payload = mode === 'url' ? { url: jobUrl } : { text: jobText };
      const d = await api.post('/api/jobs/parse', payload);
      setJob(d.job);
    } catch (e) {
      setParseError({ message: e.message, code: e.code });
    } finally {
      setParsing(false);
    }
  }

  async function generate() {
    setGenerating(true);
    setGenError(null);
    setResult(null);
    try {
      const body = {
        templateId,
        job: job || (jobText ? { description: jobText } : {}),
        uploadId: uploadId || undefined,
        prompt: customPrompt.trim() || undefined,
      };
      const d = await api.post('/api/resumes/generate', body);
      setResult(d);
    } catch (e) {
      setGenError(e.message);
    } finally {
      setGenerating(false);
    }
  }

  const canGenerate = Boolean(job || (mode === 'text' && jobText.trim()));

  return (
    <div>
      <div className="card">
        <h2>1 · Choose a template</h2>
        <p className="sub">All templates are ATS-friendly. The generated resume keeps this layout & style.</p>
        <div className="tpl-grid">
          {templates.map((t) => (
            <div
              key={t.id}
              className={`tpl ${templateId === t.id ? 'selected' : ''}`}
              onClick={() => setTemplateId(t.id)}
            >
              <div className="swatch" style={{ background: t.accent }} />
              <h3>{t.name}</h3>
              <p>{t.description}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h2>2 · Base resume (optional)</h2>
        <p className="sub">
          Upload your existing/sample resume (PDF) so the AI tailors from your real background. If you skip this, the
          selected template's sample is used as the base.
        </p>
        <div className="row">
          <input type="file" accept="application/pdf" ref={fileRef} onChange={onUpload} style={{ maxWidth: 320 }} />
          {uploads.length > 0 && (
            <select value={uploadId} onChange={(e) => setUploadId(e.target.value)} style={{ maxWidth: 320 }}>
              <option value="">— Use template sample —</option>
              {uploads.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.originalName} {u.textExtracted ? '✓ text' : '(no text)'}
                </option>
              ))}
            </select>
          )}
        </div>
        {uploadMsg && <div className={`alert ${uploadMsg.type}`} style={{ marginTop: 12 }}>{uploadMsg.text}</div>}
      </div>

      <div className="card">
        <h2>3 · Target job</h2>
        <p className="sub">Paste a job link to auto-parse it, or paste the description directly.</p>
        <div className="row" style={{ marginBottom: 12 }}>
          <button className={mode === 'url' ? '' : 'secondary'} onClick={() => setMode('url')}>
            Job link
          </button>
          <button className={mode === 'text' ? '' : 'secondary'} onClick={() => setMode('text')}>
            Paste description
          </button>
        </div>

        {mode === 'url' ? (
          <div className="field">
            <input
              placeholder="https://… link to the job posting"
              value={jobUrl}
              onChange={(e) => setJobUrl(e.target.value)}
            />
          </div>
        ) : (
          <div className="field">
            <textarea
              placeholder="Paste the full job description here…"
              value={jobText}
              onChange={(e) => setJobText(e.target.value)}
              rows={7}
            />
          </div>
        )}

        <div className="row">
          {mode === 'url' && (
            <button onClick={parse} disabled={parsing || !jobUrl.trim()}>
              {parsing ? 'Parsing…' : 'Parse job link'}
            </button>
          )}
          {mode === 'text' && (
            <button className="secondary" onClick={parse} disabled={parsing || !jobText.trim()}>
              {parsing ? 'Reading…' : 'Use this description'}
            </button>
          )}
        </div>

        {parseError && (
          <div className="alert error" style={{ marginTop: 14 }}>
            <b>Couldn't read this job link.</b> {parseError.message}
            {parseError.code === 'JS_RENDERED' && (
              <div className="tiny" style={{ marginTop: 6 }}>
                Tip: switch to “Paste description” above and paste the text from the page.
              </div>
            )}
          </div>
        )}

        {job && (
          <div className="alert ok" style={{ marginTop: 14 }}>
            <b>Parsed:</b> {job.title || '(untitled)'} {job.company && `· ${job.company}`}{' '}
            {job.location && `· ${job.location}`} {job.salary && `· ${job.salary}`}
            {job.warning && <div className="tiny" style={{ marginTop: 6 }}>⚠ {job.warning}</div>}
            <details style={{ marginTop: 8 }}>
              <summary className="tiny" style={{ cursor: 'pointer' }}>View parsed description</summary>
              <pre className="tiny" style={{ whiteSpace: 'pre-wrap', maxHeight: 200, overflow: 'auto' }}>
                {job.description}
              </pre>
            </details>
          </div>
        )}
      </div>

      <div className="card">
        <h2>4 · Generate</h2>
        <p className="sub">Creates a tailored resume in the selected template, optimized for the target job.</p>

        <div className="field">
          <label>
            Custom instructions <span className="muted tiny">(optional)</span>
          </label>
          <textarea
            placeholder="e.g. Emphasize leadership and team-building. Keep it to one page. Target a fast-growing startup. Highlight Python over Java."
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            rows={3}
            maxLength={1000}
          />
          <div className="tiny muted">
            Guides how the AI tailors your resume. Leave blank to use smart defaults. {customPrompt.length}/1000
          </div>
        </div>

        <button onClick={generate} disabled={!canGenerate || generating}>
          {generating ? 'Generating…' : '✨ Create tailored resume'}
        </button>
        {!canGenerate && <span className="muted tiny" style={{ marginLeft: 12 }}>Parse a job link or paste a description first.</span>}
        {genError && <div className="alert error" style={{ marginTop: 14 }}>{genError}</div>}
      </div>

      {result && (
        <div className="card">
          <div className="spread">
            <div>
              <h2 style={{ margin: 0 }}>Result</h2>
              <p className="sub" style={{ margin: '4px 0 0' }}>
                Engine: <span className="pill">{result.provider}</span> · Template:{' '}
                <span className="pill">{templateId}</span>
              </p>
            </div>
            <div className="row">
              <a href={`/api/resumes/${result.resume.id}/view`} target="_blank" rel="noreferrer">
                <button className="secondary">Open / Print</button>
              </a>
              <a href={`/api/resumes/${result.resume.id}/pdf`}>
                <button>Download PDF</button>
              </a>
              <a href={`/api/resumes/${result.resume.id}/download`}>
                <button className="secondary">HTML</button>
              </a>
            </div>
          </div>
          {result.warning && <div className="alert warn" style={{ marginTop: 12 }}>{result.warning}</div>}
          <iframe className="preview-frame" srcDoc={result.html} title="Resume preview" style={{ marginTop: 14 }} />
        </div>
      )}
    </div>
  );
}
