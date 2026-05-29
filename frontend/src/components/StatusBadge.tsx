import { Badge } from "@/components/ui/badge";

const STATUS_VARIANT: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  Pending: "outline",
  "In Progress": "secondary",
  Completed: "default",
  Failed: "destructive",
  "Rolling Back": "secondary",
  "Rolled Back": "outline",
};

const STATUS_DOT: Record<string, string> = {
  Pending: "bg-muted-foreground",
  "In Progress": "bg-blue-500 animate-pulse",
  Completed: "bg-emerald-500",
  Failed: "bg-destructive",
  "Rolling Back": "bg-yellow-500 animate-pulse",
  "Rolled Back": "bg-muted-foreground",
};

export default function StatusBadge({ status }: { status: string }) {
  const variant = STATUS_VARIANT[status] ?? "outline";
  const dotCls = STATUS_DOT[status] ?? "bg-muted-foreground";

  return (
    <Badge variant={variant} className="gap-1.5 font-medium">
      <span className={`inline-block size-2 rounded-full ${dotCls}`} />
      {status || "Unknown"}
    </Badge>
  );
}
