import { useEffect, useState } from 'react';
import socket from '../socket.js';

export default function useDeploymentStatus(deploymentId) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [connected, setConnected] = useState(socket.connected);

  useEffect(() => {
    if (!deploymentId) return undefined;
    let cancelled = false;

    async function fetchOnce() {
      try {
        const res = await fetch(`/api/status/${deploymentId}`);
        if (!res.ok) throw new Error(`status ${res.status}`);
        const json = await res.json();
        if (!cancelled) setData(json);
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    }

    fetchOnce();
    socket.emit('subscribe', deploymentId);

    function onUpdate(payload) {
      if (payload && payload.id === deploymentId) setData(payload);
    }
    function onConnect() {
      setConnected(true);
      socket.emit('subscribe', deploymentId);
      fetchOnce();
    }
    function onDisconnect() {
      setConnected(false);
    }

    socket.on('deployment:update', onUpdate);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);

    return () => {
      cancelled = true;
      socket.emit('unsubscribe', deploymentId);
      socket.off('deployment:update', onUpdate);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, [deploymentId]);

  return { data, error, connected };
}
