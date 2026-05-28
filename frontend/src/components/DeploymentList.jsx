import React from 'react';
import StatusBadge from './StatusBadge.jsx';

function fmtTime(s) {
  if (!s) return '';
  try {
    return new Date(s).toLocaleString();
  } catch {
    return s;
  }
}

export default function DeploymentList({ deployments, selectedId, onSelect }) {
  if (!deployments || deployments.length === 0) {
    return (
      <div className="empty">
        <div className="empty-title">No deployments yet</div>
        <div className="empty-sub">Submit the form to onboard your first client.</div>
      </div>
    );
  }
  return (
    <ul className="dlist">
      {deployments.map((d) => (
        <li
          key={d.id}
          className={`dlist-row ${selectedId === d.id ? 'is-selected' : ''}`}
          onClick={() => onSelect(d.id)}
        >
          <div className="dlist-main">
            <div className="dlist-client">{d.clientName}</div>
            <div className="dlist-domain">{d.domain}</div>
          </div>
          <div className="dlist-meta">
            <StatusBadge status={d.status} />
            <div className="dlist-time">{fmtTime(d.updatedAt || d.createdAt)}</div>
          </div>
        </li>
      ))}
    </ul>
  );
}
