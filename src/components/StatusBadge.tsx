import { AlertTriangle, Ban, CheckCircle2, Clock } from "lucide-react";
import type { InvoiceStatus } from "@/mappers/consultationQueue";

const STATUS_CONFIG: Record<
  InvoiceStatus,
  { label: string; text: string; bg: string; border: string; Icon: typeof Clock }
> = {
  Accepted: {
    label: "Aceptada",
    text: "text-status-accepted-text",
    bg: "bg-status-accepted-bg",
    border: "border-status-accepted-border",
    Icon: CheckCircle2,
  },
  Draft: {
    label: "Borrador",
    text: "text-status-draft-text",
    bg: "bg-status-draft-bg",
    border: "border-status-draft-border",
    Icon: Clock,
  },
  Rejected: {
    label: "Rechazada",
    text: "text-status-rejected-text",
    bg: "bg-status-rejected-bg",
    border: "border-status-rejected-border",
    Icon: AlertTriangle,
  },
  Annulled: {
    label: "Anulada",
    text: "text-muted",
    bg: "bg-cool-grey",
    border: "border-grid-line",
    Icon: Ban,
  },
};

/**
 * Presentational DIAN status badge.
 * Pure: no state, no side effects, no data mapping.
 */
export function StatusBadge({ status }: { status: InvoiceStatus }) {
  const { label, text, bg, border, Icon } = STATUS_CONFIG[status];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-semibold ${bg} ${text} ${border}`}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {label}
    </span>
  );
}
