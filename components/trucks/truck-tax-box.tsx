import { Paperclip } from "lucide-react"
import Link from "next/link"

import { formatDate } from "@/lib/driver-format"
import { formatTaxYear, type taxItem } from "@/lib/truck-format"

/**
 * The 2290 beside the truck page: whether a return covers the truck this
 * tax year, and that return's Schedule 1, which is kept on the return.
 */
export function TruckTaxBox({
  tax,
  complianceHref,
}: {
  /** Null when the truck is too light to owe the 2290. */
  tax: ReturnType<typeof taxItem> | null
  /** /org/<slug>/compliance, where returns are recorded. */
  complianceHref: string
}) {
  return (
    <section className="rounded-xl border bg-card px-5 pt-4 pb-5 text-card-foreground shadow-xs">
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        2290
      </p>
      {!tax ? (
        <p className="mt-2 text-sm text-muted-foreground">
          Not needed: registered under 55,000 lbs.
        </p>
      ) : tax.filing ? (
        <>
          <p className="mt-2 text-sm font-medium">
            Covered for {formatTaxYear(tax.taxYear)}
          </p>
          <p className="text-sm text-muted-foreground">
            On the return filed {formatDate(tax.filing.filed_on)}.
          </p>
          {tax.filing.schedule1?.url ? (
            <a
              href={tax.filing.schedule1.url}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex items-center gap-1.5 text-sm hover:underline"
            >
              <Paperclip className="size-3.5" />
              Schedule 1
            </a>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              No Schedule 1 yet.{" "}
              <Link href={complianceHref} className="underline">
                Add it on Compliance
              </Link>
            </p>
          )}
        </>
      ) : (
        <>
          <p className="mt-2 text-sm font-medium">
            Not on a {formatTaxYear(tax.taxYear)} return
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            <Link href={complianceHref} className="underline">
              Record it on Compliance
            </Link>
            , on the yearly return or a new one for this truck.
          </p>
        </>
      )}
    </section>
  )
}
