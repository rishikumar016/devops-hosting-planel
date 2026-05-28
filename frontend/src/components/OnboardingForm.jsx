import React, { useState } from 'react';

const DOMAIN_RE = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;
const IMAGE_RE = /^[a-z0-9._\-\/]+(:[a-zA-Z0-9._-]+)?$/;

function validateLocal({ clientName, domain, image }) {
  const errors = {};
  if (!clientName || clientName.trim().length < 2) errors.clientName = 'At least 2 characters.';
  if (!DOMAIN_RE.test(String(domain).trim().toLowerCase())) errors.domain = 'Looks invalid (e.g. app.example.com).';
  if (!IMAGE_RE.test(String(image).trim())) errors.image = 'Use repo[:tag] (lowercase).';
  return errors;
}

export default function OnboardingForm({ onCreated }) {
  const [form, setForm] = useState({ clientName: '', domain: '', image: '' });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState(null);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function onSubmit(e) {
    e.preventDefault();
    setServerError(null);
    const errs = validateLocal(form);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setSubmitting(true);
    try {
      const res = await fetch('/api/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setServerError(json.error || JSON.stringify(json.errors || json));
        setErrors(json.errors || {});
        return;
      }
      setForm({ clientName: '', domain: '', image: '' });
      if (onCreated) onCreated(json.deployment);
    } catch (err) {
      setServerError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="card" onSubmit={onSubmit}>
      <h2 className="card-title">Onboard client</h2>
      <p className="card-sub">
        Spins up the image on the host, registers the Caddy route, and runs the post-deploy Lambda.
      </p>

      <label className="lbl" htmlFor="clientName">Client name</label>
      <input
        id="clientName"
        className="input"
        autoComplete="off"
        placeholder="acme-corp"
        value={form.clientName}
        onChange={(e) => update('clientName', e.target.value)}
      />
      {errors.clientName && <div className="err">{errors.clientName}</div>}

      <label className="lbl" htmlFor="domain">Domain</label>
      <input
        id="domain"
        className="input"
        autoComplete="off"
        placeholder="app.acme.example.com"
        value={form.domain}
        onChange={(e) => update('domain', e.target.value)}
      />
      {errors.domain && <div className="err">{errors.domain}</div>}

      <label className="lbl" htmlFor="image">Docker image</label>
      <input
        id="image"
        className="input"
        autoComplete="off"
        placeholder="nginx:1.27-alpine"
        value={form.image}
        onChange={(e) => update('image', e.target.value)}
      />
      {errors.image && <div className="err">{errors.image}</div>}

      <button className="btn btn-primary" disabled={submitting} type="submit">
        {submitting ? 'Submitting…' : 'Deploy'}
      </button>

      {serverError && <div className="err err-banner">{serverError}</div>}
    </form>
  );
}
