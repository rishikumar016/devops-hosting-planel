import { useEffect, useState } from "react";
import OnboardingForm from "@/components/OnboardingForm";
import DeploymentList from "@/components/DeploymentList";
import DeploymentDetail from "@/components/DeploymentDetail";
import socket from "@/socket";
import type { Deployment } from "@/types";
import { Activity, Wifi, WifiOff } from "lucide-react";

async function fetchDeployments(): Promise<Deployment[]> {
  const res = await fetch("/api/deployments");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return json.deployments || [];
}

export default function App() {
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [wsConnected, setWsConnected] = useState(socket.connected);
  const [err, setErr] = useState<string | null>(null);

  async function refreshList() {
    try {
      const list = await fetchDeployments();
      setDeployments(list);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => {
    refreshList();

    function onListUpdate({
      id,
      status,
      updatedAt,
    }: {
      id: string;
      status: string;
      updatedAt: string;
    }) {
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

    socket.on("deployment:list-update", onListUpdate);
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);

    return () => {
      socket.off("deployment:list-update", onListUpdate);
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
    };
  }, []);

  function handleCreated(deployment: Deployment) {
    setDeployments((prev) => [deployment, ...prev]);
    setSelectedId(deployment.id);
  }

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
          <div className="flex items-center gap-2 font-semibold tracking-tight">
            <Activity className="size-5 text-primary" />
            Hosting Control Panel
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            {wsConnected ? (
              <Wifi className="size-4 text-emerald-500" />
            ) : (
              <WifiOff className="size-4 text-destructive animate-pulse" />
            )}
            <span>{wsConnected ? "Live" : "Reconnecting…"}</span>
          </div>
        </div>
      </header>

      {/* Error banner */}
      {err && (
        <div className="border-b bg-destructive/10 px-4 py-2 text-center text-sm text-destructive">
          {err}
        </div>
      )}

      {/* Main */}
      <main className="mx-auto grid w-full max-w-7xl flex-1 gap-6 p-4 md:grid-cols-[380px_1fr]">
        {/* Left column */}
        <div className="flex flex-col gap-6">
          <OnboardingForm onCreated={handleCreated} />
          <DeploymentList
            deployments={deployments}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        </div>

        {/* Right column */}
        <DeploymentDetail deploymentId={selectedId} />
      </main>

      {/* Footer */}
      <footer className="border-t py-3 text-center text-xs text-muted-foreground">
        API: /api/* &middot; WS: /socket.io &middot; Metrics: /metrics
      </footer>
    </div>
  );
}
