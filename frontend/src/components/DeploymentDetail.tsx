import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { MonitorCog, RotateCcw, Loader2 } from "lucide-react";
import StatusBadge from "@/components/StatusBadge";
import useDeploymentStatus from "@/hooks/useDeploymentStatus";
import { cn } from "@/lib/utils";
import type { LogLine } from "@/types";

function fmtTime(s: string | undefined) {
  if (!s) return "";
  try {
    const d = new Date(s);
    return (
      d.toLocaleTimeString(undefined, { hour12: false }) +
      "." +
      String(d.getMilliseconds()).padStart(3, "0")
    );
  } catch {
    return s;
  }
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1 text-sm">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="truncate font-mono text-xs">{value}</span>
    </div>
  );
}

function LogEntry({ line }: { line: LogLine }) {
  return (
    <div
      className={cn(
        "flex gap-3 px-3 py-0.5 font-mono text-xs",
        line.level === "error" && "text-destructive",
        line.level === "warn" && "text-yellow-600",
      )}
    >
      <span className="shrink-0 text-muted-foreground">{fmtTime(line.ts)}</span>
      <span className="break-all">{line.message}</span>
    </div>
  );
}

export default function DeploymentDetail({
  deploymentId,
}: {
  deploymentId: string | null;
}) {
  const { data, error, connected } = useDeploymentStatus(deploymentId);
  const [rollbackErr, setRollbackErr] = useState<string | null>(null);
  const [rolling, setRolling] = useState(false);

  if (!deploymentId) {
    return (
      <Card className="flex h-full flex-col items-center justify-center">
        <CardContent className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
          <MonitorCog className="size-10 stroke-1" />
          <p className="text-sm font-medium">Select a deployment</p>
          <p className="text-xs">
            Pick a row on the left to view live status and logs.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-6">
          <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            Failed to load: {error}
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card className="flex h-full items-center justify-center">
        <CardContent className="py-16">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const canRollback = ["Completed", "Failed"].includes(data.status);
  const logs = data.logs || [];

  async function doRollback() {
    setRollbackErr(null);
    setRolling(true);
    try {
      const res = await fetch(`/api/deploy/${deploymentId}/rollback`, {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok || !json.ok)
        setRollbackErr(json.error || `HTTP ${res.status}`);
    } catch (err) {
      setRollbackErr(err instanceof Error ? err.message : String(err));
    } finally {
      setRolling(false);
    }
  }

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <CardTitle className="truncate">{data.clientName}</CardTitle>
            <p className="truncate text-sm text-muted-foreground">
              {data.domain}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={data.status} />
            <span
              className={cn(
                "inline-block size-2 rounded-full",
                connected ? "bg-emerald-500" : "bg-destructive animate-pulse",
              )}
              title={connected ? "live" : "reconnecting…"}
            />
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col gap-4 overflow-hidden">
        {/* Metadata */}
        <div>
          <MetaRow label="Image" value={data.image} />
          <MetaRow label="Container" value={data.containerName || "—"} />
          <MetaRow
            label="Container ID"
            value={data.containerId ? data.containerId.slice(0, 12) : "—"}
          />
          <MetaRow label="Host port" value={data.hostPort || "—"} />
          <MetaRow label="Lambda req" value={data.lambdaRequestId || "—"} />
          <MetaRow
            label="Teardown req"
            value={data.teardownLambdaRequestId || "—"}
          />
        </div>

        {data.errorMessage && (
          <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            Error: {data.errorMessage}
          </p>
        )}

        <Separator />

        {/* Logs */}
        <div className="flex-1 overflow-hidden">
          <p className="mb-2 text-xs font-medium text-muted-foreground">Logs</p>
          <ScrollArea className="h-65 rounded-md border bg-muted/30">
            {logs.length === 0 ? (
              <p className="p-4 text-center text-xs text-muted-foreground">
                No log lines yet.
              </p>
            ) : (
              <div className="py-1">
                {logs.map((l, i) => (
                  <LogEntry key={i} line={l} />
                ))}
              </div>
            )}
          </ScrollArea>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 pt-2">
          <AlertDialog>
            <AlertDialogTrigger
              disabled={!canRollback || rolling}
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-destructive px-3 text-sm font-medium text-white shadow-xs transition-all hover:bg-destructive/90 disabled:pointer-events-none disabled:opacity-50"
            >
              <RotateCcw className="size-4" />
              {rolling ? "Rolling back…" : "Rollback"}
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Confirm Rollback</AlertDialogTitle>
                <AlertDialogDescription>
                  Roll back <strong>{data.clientName}</strong> ({data.domain})?
                  This will stop the container and remove the Caddy route.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={doRollback}>
                  Rollback
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {rollbackErr && (
            <span className="text-sm text-destructive">{rollbackErr}</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
