import { cn } from "cn"

import {
  INVOICE_STATE_LABELS,
  INVOICE_STATE_STYLES,
  type InvoiceState,
} from "@/lib/invoice-format"

export function InvoiceStatusBadge({
  state,
  className,
}: {
  state: InvoiceState
  className?: string
}) {
  return (
    <span
      className={cn(
        "inline-flex h-6 w-fit shrink-0 items-center rounded-4xl px-2.5 text-xs font-medium whitespace-nowrap",
        INVOICE_STATE_STYLES[state],
        className
      )}
    >
      {INVOICE_STATE_LABELS[state]}
    </span>
  )
}
