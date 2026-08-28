import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { formatCOP } from "@/mappers/consultationQueue";
import { toCents } from "@/schemas/provet";

interface ReconciliationBarProps {
  consultationTotal: number;
  paidAmount: number;
}

/**
 * Live payment-totals reconciliation strip (spec §3).
 * Pure presentational: balanced → green check, mismatch → red alert.
 */
export function ReconciliationBar({
  consultationTotal,
  paidAmount,
}: ReconciliationBarProps) {
  const difference = consultationTotal - paidAmount;
  const balanced = toCents(consultationTotal) - toCents(paidAmount) === 0;

  return (
    <div className="grid grid-cols-3 gap-2 rounded-md border border-grid-line bg-cool-grey p-2 text-xs">
      <div>
        <div className="text-muted">Total Consulta</div>
        <div className="font-semibold text-slate-text">
          {formatCOP(consultationTotal)} COP
        </div>
      </div>
      <div className="border-l border-grid-line pl-2">
        <div className="text-muted">Total Pagado</div>
        <div className="font-semibold text-slate-text">
          {formatCOP(paidAmount)} COP
        </div>
      </div>
      <div className="border-l border-grid-line pl-2">
        <div className="text-muted">Diferencia</div>
        {balanced ? (
          <span className="inline-flex items-center gap-1 font-semibold text-status-accepted-text">
            <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
            {formatCOP(0)} COP (Balanceado)
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 font-semibold text-status-rejected-text">
            <AlertTriangle className="h-3 w-3" aria-hidden="true" />
            {formatCOP(Math.abs(difference))} COP
          </span>
        )}
      </div>
    </div>
  );
}
