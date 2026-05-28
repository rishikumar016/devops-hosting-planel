import React, { useEffect, useState } from 'react';
import OnboardingForm from './components/OnboardingForm.jsx';
import DeploymentList from './components/DeploymentList.jsx';
import DeploymentDetail from './components/DeploymentDetail.jsx';
import socket from './socket.js';

async function fetchDeployments() {
  const res = await fetch('/api/deployments');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return json.deployments || [];
}

export default function App() {
  const [deployments, setDeployments] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [wsConnected, setWsConnected] = useState(socket.connected);
  const [err, setErr] = useState(null);

  async function refreshList() {
    try {
      const list = await fetchDeployments();
      setDeployments(list);
      setErr(null);
    } catch (e) {
      setErr(e.message);
    }
  }

  useEffect(() => {
    refreshList();

    function onListUpdate({ id, status, updatedAt }) {
      setDeployments((prev) => {
        const next = [...prev];
        const idx = next.findIndex((d) => d.id === id);
        if (idx >= 0) {
          next[idx] = { ...next[idx], status, updatedAt };
        } else {
          refreshList();
        }
        return next;
      });
    }

    function onConnect() {
      setWsConnected(true);
      refreshList();
    }
    function onDisconnect() {
      setWsConnected(false);
    }

    socket.on('deployment:list-update', onListUpdate);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);

    return () => {
      socket.off('deployment:list-update', onListUpdate);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, []);

  function handleCreated(deployment) {
    setDeployments((prev) => [
      {
        id: deployment.id,
        clientName: deployment.clientName,
        domain: deployment.domain,
        image: deployment.image,
        status: deployment.status,
        createdAt: deployment.createdAt,
        updatedAt: deployment.createdAt,
      },
      ...prev,
    ]);
    setSelectedId(deployment.id);
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">▮</span>
          <span className="brand-name">Hosting Control Panel</span>
        </div>
        <div className="topbar-meta">
          <span className={`dot ${wsConnected ? '' : 'dot-off'}`} />
          <span className="topbar-text">{wsConnected ? 'live' : 'reconnecting…'}</span>
        </div>
      </header>

      {err && <div className="err err-banner">{err}</div>}

      <div className="grid">
        <section>
          <OnboardingForm onCreated={handleCreated} />
          <div className="card list-card">
            <h2 className="card-title">Recent deployments</h2>
            <DeploymentList
              deployments={deployments}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          </div>
        </section>

        <section className="card detail-card">
          <h2 className="card-title">Live status</h2>
          <DeploymentDetail deploymentId={selectedId} />
        </section>
      </div>

      <footer className="footer">
        <span>API: /api/* &middot; WS: /socket.io &middot; Metrics: /metrics</span>
      </footer>
    </div>
  );
}
