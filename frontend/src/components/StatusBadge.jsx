import React from 'react';

const STATUS_CLASS = {
  Pending: 'pending',
  'In Progress': 'progress',
  Completed: 'completed',
  Failed: 'failed',
  'Rolling Back': 'progress',
  'Rolled Back': 'rolled',
};

export default function StatusBadge({ status }) {
  const cls = STATUS_CLASS[status] || 'rolled';
  return (
    <span className={`badge ${cls}`}>
      <span className="dot" />
      {status || 'Unknown'}
    </span>
  );
}
