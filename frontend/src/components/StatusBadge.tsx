const STATUS_CLASS: Record<string, string> = {
  Pending: "pending",
  "In Progress": "progress",
  Completed: "completed",
  Failed: "failed",
  "Rolling Back": "progress",
  "Rolled Back": "rolled",
};

interface Props {
  status: string;
}

export default function StatusBadge({ status }: Props) {
  const cls = STATUS_CLASS[status] || "rolled";
  return (
    <span className={`badge ${cls}`}>
      <span className="dot" />
      {status || "Unknown"}
    </span>
  );
}
