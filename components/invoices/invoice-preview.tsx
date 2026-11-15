import { formatInvoiceDate, formatTerms } from "@/lib/invoice-format"
import type { InvoicePage } from "@/lib/invoice-pdf"
import { formatRate } from "@/lib/load-format"

function Block({
  label,
  name,
  lines,
}: {
  label: string
  name: string
  lines: string[]
}) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold tracking-wide text-neutral-500 uppercase">
        {label}
      </p>
      <p className="mt-1 font-semibold">{name}</p>
      {lines.map((line) => (
        <p key={line} className="text-sm text-neutral-600">
          {line}
        </p>
      ))}
    </div>
  )
}

/**
 * The invoice page as it prints, on a white sheet in both themes. The
 * packet PDF draws the same `InvoicePage`.
 */
export function InvoicePreview({ page }: { page: InvoicePage }) {
  const facts: [string, string][] = [
    ["Load #", page.load.reference],
    ...(page.load.reference_numbers
      ? ([["Reference", page.load.reference_numbers]] as [string, string][])
      : []),
    ["Pickup", page.load.pickup],
    [page.load.stops > 2 ? "Final delivery" : "Delivery", page.load.delivery],
    ...(page.load.freight
      ? ([["Freight", page.load.freight]] as [string, string][])
      : []),
  ]

  return (
    <div className="relative overflow-hidden rounded-xl border bg-white p-6 text-neutral-900 shadow-xs sm:p-10">
      {page.draft && (
        <span
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-[30deg] text-8xl font-black tracking-widest text-neutral-100 select-none sm:text-9xl"
        >
          DRAFT
        </span>
      )}
      <div className="relative flex flex-col gap-8">
        <div className="flex flex-col-reverse gap-6 sm:flex-row sm:justify-between">
          <Block
            label="From"
            name={page.from.name}
            lines={[
              ...page.from.lines,
              ...(page.from.contact ? [page.from.contact] : []),
              ...(page.from.ids ? [page.from.ids] : []),
            ]}
          />
          <div className="sm:text-right">
            <p className="text-3xl font-bold tracking-tight text-[#007a55]">
              INVOICE
            </p>
            <dl className="mt-3 grid grid-cols-[auto_auto] gap-x-4 gap-y-1 text-sm whitespace-nowrap sm:justify-end">
              <dt className="text-neutral-500">Invoice #</dt>
              <dd className="font-semibold tabular-nums">{page.number}</dd>
              <dt className="text-neutral-500">Invoice date</dt>
              <dd className="font-semibold">
                {formatInvoiceDate(page.invoice_date)}
              </dd>
              <dt className="text-neutral-500">Terms</dt>
              <dd className="font-semibold">{formatTerms(page.terms_days)}</dd>
              <dt className="text-neutral-500">Due date</dt>
              <dd className="font-semibold">
                {formatInvoiceDate(page.due_on)}
              </dd>
            </dl>
          </div>
        </div>

        <div className="grid gap-6 border-t border-neutral-200 pt-6 sm:grid-cols-2">
          <Block
            label="Bill to"
            name={page.bill_to.name}
            lines={page.bill_to.lines}
          />
          {page.remit_to && (
            <Block
              label="Remit payment to"
              name={page.remit_to.name}
              lines={page.remit_to.lines}
            />
          )}
        </div>
        {page.remit_to && (
          <p className="-mt-4 text-sm font-semibold">
            This invoice has been assigned to {page.remit_to.name}. Pay only to{" "}
            {page.remit_to.name} at the address above.
          </p>
        )}

        <div>
          <p className="text-[11px] font-semibold tracking-wide text-neutral-500 uppercase">
            Load
          </p>
          <dl className="mt-2 grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm">
            {facts.map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-neutral-500">{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="bg-neutral-100 text-left">
              <th className="px-3 py-2 font-semibold">Description</th>
              <th className="px-3 py-2 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody>
            {page.lines.map((line, index) => (
              <tr key={index} className="border-b border-neutral-200">
                <td className="px-3 py-2.5">{line.label}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {formatRate(line.amount)}
                </td>
              </tr>
            ))}
            {page.lines.length === 0 && (
              <tr className="border-b border-neutral-200">
                <td colSpan={2} className="px-3 py-4 text-neutral-500">
                  No charges on the load yet.
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr>
              <td className="px-3 pt-4 text-right text-base font-semibold">
                Total due
              </td>
              <td className="px-3 pt-4 text-right text-base font-semibold tabular-nums">
                {formatRate(page.total)}
              </td>
            </tr>
          </tfoot>
        </table>

        {page.notes && (
          <div>
            <p className="text-[11px] font-semibold tracking-wide text-neutral-500 uppercase">
              Notes
            </p>
            <p className="mt-1 text-sm whitespace-pre-line">{page.notes}</p>
          </div>
        )}

        <p className="text-xs text-neutral-500">
          {page.remit_to
            ? `Questions about this invoice? Contact ${page.from.name}${page.from.contact ? `, ${page.from.contact}` : ""}.`
            : `Please include invoice # ${page.number} with your payment. Thank you for your business.`}
        </p>
      </div>
    </div>
  )
}
