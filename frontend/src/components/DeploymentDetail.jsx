import React, { useState } from 'react';
import StatusBadge from './StatusBadge.jsx';
import useDeploymentStatus from '../hooks/useDeploymentStatus.js';

function fmtTime(s) {
  if (!s) return '';
  try {
    const d = new Date(s);
    return d.toLocaleTimeString(undefined, { hour12: false }) + '.' + String(d.getMilliseconds()).padStart(3, '0');
  } catch {
    return s;
  }
}

export default function DeploymentDetail({ deploymentId }) {
  const { data, error, connected } = useDeploymentStatus(deploymentId);
  const [rollbackErr, setRollbackErr] = useState(null);
  const [rolling, setRolling] = useState(false);

  if (!deploymentId) {
    return (
      <div className="empty">
        <div className="empty-title">Select a deployment</div>
        <div className="empty-sub">Pick a row on the left to view live status and logs.</div>
      </div>
    );
  }
  if (error) return <div className="err err-banner">Failed to load: {error}</div>;
  if (!data) return <div className="empty"><div className="empty-title">Loading…</div></div>;

  const canRollback = ['Completed', 'Failed'].includes(data.status);

  async function doRollback() {
    if (!window.confirm(`Roll back ${data.clientName} (${data.domain})? This will stop the container and remove the Caddy route.`)) {
      return;
    }
    setRollbackErr(null);
    setRolling(true);
    try {
      const res = await fetch(`/api/deploy/${deploymentId}/rollback`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok || !json.ok) setRollbackErr(json.error || `HTTP ${res.status}`);
    } catch (err) {
      setRollbackErr(err.message);
    } finally {
      setRolling(false);
    }
  }

  const logs = data.logs || [];

  return (
    <div>
      <div className="detail-head">
        <div>
          <div className="detail-client">{data.clientName}</div>
          <div className="detail-domain">{data.domain}</div>
        </div>
        <div className="detail-status">
          <StatusBadge status={data.status} />
          <span className={`dot ${connected ? '' : 'dot-off'}`} title={connected ? 'live' : 'reconnecting…'} />
        </div>
      </div>

      <div className="detail-meta">
        <div><span className="lbl">Image</span><span className="val">{data.image}</span></div>
        <div><span className="lbl">Container</span><span className="val">{data.containerName || '—'}</span></div>
        <div><span className="lbl">Container ID</span><span className="val">{data.containerId ? data.containerId.slice(0, 12) : '—'}</span></div>
        <div><span className="lbl">Host port</span><span className="val">{data.hostPort || '—'}</span></div>
        <div><span className="lbl">Lambda req</span><span className="val">{data.lambdaRequestId || '—'}</span></div>
        <div><span className="lbl">Teardown req</span><span className="val">{data.teardownLambdaRequestId || '—'}</span></div>
      </div>

      {data.errorMessage && (
        <div className="err err-banner">Error: {data.errorMessage}</div>
      )}

      <div className="logs">
        {logs.length === 0 ? (
          <div className="log-empty">No log lines yet.</div>
        ) : (
          logs.map((l, i) => (
            <div className={`log-line ${l.level || 'info'}`} key={i}>
              <span className="log-ts">{fmtTime(l.ts)}</span>
              <span className="log-msg">{l.message}</span>
            </div>
          ))
        )}
      </div>

      <div className="detail-actions">
        <button
          className="btn btn-danger"
          disabled={!canRollback || rolling}
          onClick={doRollback}
          title={canRollback ? 'Roll back this deployment' : 'Rollback only available after Completed/Failed'}
        >
          {rolling ? 'Rolling back…' : 'Rollback'}
        </button>
        {rollbackErr && <span className="err">{rollbackErr}</span>}
      </div>
    </div>
  );
}
