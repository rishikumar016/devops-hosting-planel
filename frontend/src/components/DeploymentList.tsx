import StatusBadge from "./StatusBadge";
import type { Deployment } from "../types";

interface Props {
  deployments: Deployment[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

function fmtTime(s: string | undefined): string {
  if (!s) return "";
  try {
    return new Date(s).toLocaleString();
  } catch {
    return s;
  }
}

export default function DeploymentList({
  deployments,
  selectedId,
  onSelect,
}: Props) {
  if (!deployments || deployments.length === 0) {
    return (
      <div className="empty">
        <div className="empty-title">No deployments yet</div>
        <div className="empty-sub">
          Submit the form to onboard your first client.
        </div>
      </div>
    );
  }
  return (
    <ul className="dlist">
      {deployments.map((d) => (
        <li
          key={d.id}
          className={`dlist-row ${selectedId === d.id ? "is-selected" : ""}`}
          onClick={() => onSelect(d.id)}
        >
          <div className="dlist-main">
            <div className="dlist-client">{d.clientName}</div>
            <div className="dlist-domain">{d.domain}</div>
          </div>
          <div className="dlist-meta">
            <StatusBadge status={d.status} />
            <div className="dlist-time">
              {fmtTime(d.updatedAt || d.createdAt)}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
