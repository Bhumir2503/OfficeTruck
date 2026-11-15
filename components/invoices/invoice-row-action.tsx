"use client"

import { Send, Wallet } from "lucide-react"
import Link from "next/link"
import { useState } from "react"

import { RecordPaymentDialog } from "@/components/invoices/invoice-side-panel"
import { Button, buttonVariants } from "@/components/ui/button"
import { balanceDue, type InvoiceState } from "@/lib/invoice-format"
import type { InvoiceListItem } from "@/lib/invoices"

/**
 * What an invoice in the list needs next, as one button: send a draft,
 * record a payment on one that's out. Paid and void ones need nothing.
 */
export function InvoiceRowAction({
  organizationId,
  invoice,
  state,
  href,
  today,
}: {
  organizationId: string
  invoice: InvoiceListItem
  state: InvoiceState
  /** The invoice's page. */
  href: string
  /** "YYYY-MM-DD" */
  today: string
}) {
  const [paying, setPaying] = useState(false)

  if (state === "draft") {
    // Sending takes the email form and a look at the invoice, so it opens there.
    return (
      <Link
        href={href}
        className={buttonVariants({
          size: "sm",
          className: "whitespace-nowrap",
        })}
      >
        <Send />
        Send
      </Link>
    )
  }

  if (state === "sent" || state === "partial" || state === "overdue") {
    return (
      <>
        <Button
          size="sm"
          variant={state === "overdue" ? "default" : "outline"}
          className="whitespace-nowrap"
          onClick={() => setPaying(true)}
        >
          <Wallet />
          Record payment
        </Button>
        <RecordPaymentDialog
          open={paying}
          onOpenChange={setPaying}
          organizationId={organizationId}
          invoice={invoice}
          balance={balanceDue(invoice.total, invoice.paid_amount)}
          today={today}
        />
      </>
    )
  }

  return (
    <span className="whitespace-nowrap text-muted-foreground">
      {state === "paid" ? "Done" : "—"}
    </span>
  )
}
