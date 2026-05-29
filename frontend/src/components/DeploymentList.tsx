import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Inbox } from "lucide-react";
import StatusBadge from "@/components/StatusBadge";
import { cn } from "@/lib/utils";
import type { Deployment } from "@/types";

function fmtTime(s: string | undefined) {
  if (!s) return "";
  try {
    return new Date(s).toLocaleString();
  } catch {
    return s;
  }
}

interface DeploymentListProps {
  deployments: Deployment[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export default function DeploymentList({
  deployments,
  selectedId,
  onSelect,
}: DeploymentListProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Deployments</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {deployments.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
            <Inbox className="size-10 stroke-1" />
            <p className="text-sm font-medium">No deployments yet</p>
            <p className="text-xs">
              Submit the form to onboard your first client.
            </p>
          </div>
        ) : (
          <ScrollArea className="h-100">
            <ul className="divide-y">
              {deployments.map((d) => (
                <li
                  key={d.id}
                  onClick={() => onSelect(d.id)}
                  className={cn(
                    "flex cursor-pointer items-center justify-between gap-4 px-6 py-3 transition-colors hover:bg-accent/50",
                    selectedId === d.id && "bg-accent",
                  )}
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{d.clientName}</p>
                    <p className="truncate text-sm text-muted-foreground">
                      {d.domain}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <StatusBadge status={d.status} />
                    <span className="text-xs text-muted-foreground">
                      {fmtTime(d.updatedAt || d.createdAt)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
