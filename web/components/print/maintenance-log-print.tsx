import { PrintButton } from "@/components/print/print-button"
import { formatDate } from "@/lib/driver-format"
import { formatRate } from "@/lib/load-format"
import { MAINTENANCE_LABELS, type MaintenanceKind } from "@/lib/schemas/truck"

const thousands = new Intl.NumberFormat("en-US")

export type PrintEntry = {
  id: string
  done_on: string
  kind: MaintenanceKind
  description: string
  odometer: number | null
  cost: number | null
  vendor: string | null
  receipt: unknown | null
}

/**
 * A vehicle's maintenance record as a printable page: who it belongs to,
 * which vehicle, and every service, repair and inspection, oldest first, as
 * kept for each vehicle under 49 CFR 396.3.
 */
export function MaintenanceLogPrint({
  company,
  title,
  facts,
  entries,
  printedOn,
}: {
  company: string
  /** "Truck 101" */
  title: string
  /** Label and value pairs about the vehicle: VIN, plate, make. */
  facts: [string, string][]
  entries: PrintEntry[]
  /** "YYYY-MM-DD" */
  printedOn: string
}) {
  const oldestFirst = [...entries].sort((a, b) =>
    a.done_on.localeCompare(b.done_on)
  )
  const spent = entries.reduce((sum, entry) => sum + (entry.cost ?? 0), 0)

  return (
    <main className="mx-auto max-w-4xl bg-white px-8 py-10 text-sm text-black print:max-w-none print:p-0">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium tracking-wide text-neutral-500 uppercase">
            {company}
          </p>
          <h1 className="mt-1 text-2xl font-semibold">
            Maintenance record · {title}
          </h1>
          <p className="mt-1 text-neutral-500">
            Printed {formatDate(printedOn)}
          </p>
        </div>
        <PrintButton />
      </div>

      {facts.length > 0 && (
        <dl className="mb-6 grid grid-cols-2 gap-x-6 gap-y-2 border-y border-neutral-300 py-3 sm:grid-cols-4">
          {facts.map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs text-neutral-500">{label}</dt>
              <dd className="font-medium">{value}</dd>
            </div>
          ))}
        </dl>
      )}

      {oldestFirst.length === 0 ? (
        <p className="text-neutral-500">Nothing has been logged yet.</p>
      ) : (
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b-2 border-neutral-800 text-left">
              <th className="py-2 pr-3 font-semibold whitespace-nowrap">
                Date
              </th>
              <th className="py-2 pr-3 font-semibold">Type</th>
              <th className="py-2 pr-3 font-semibold">Work done</th>
              <th className="py-2 pr-3 font-semibold">Shop</th>
              <th className="py-2 pr-3 text-right font-semibold">Odometer</th>
              <th className="py-2 text-right font-semibold">Cost</th>
            </tr>
          </thead>
          <tbody>
            {oldestFirst.map((entry) => (
              <tr
                key={entry.id}
                className="break-inside-avoid border-b border-neutral-200 align-top"
              >
                <td className="py-2 pr-3 whitespace-nowrap tabular-nums">
                  {formatDate(entry.done_on)}
                </td>
                <td className="py-2 pr-3 whitespace-nowrap">
                  {MAINTENANCE_LABELS[entry.kind]}
                </td>
                <td className="py-2 pr-3">
                  {entry.description}
                  {entry.receipt ? (
                    <span className="text-neutral-500"> · receipt on file</span>
                  ) : null}
                </td>
                <td className="py-2 pr-3">{entry.vendor ?? "—"}</td>
                <td className="py-2 pr-3 text-right whitespace-nowrap tabular-nums">
                  {entry.odometer === null
                    ? "—"
                    : `${thousands.format(entry.odometer)} mi`}
                </td>
                <td className="py-2 text-right whitespace-nowrap tabular-nums">
                  {entry.cost === null ? "—" : formatRate(entry.cost)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={4} className="pt-3 text-neutral-500">
                {entries.length === 1 ? "1 entry" : `${entries.length} entries`}
              </td>
              <td
                colSpan={2}
                className="pt-3 text-right font-semibold tabular-nums"
              >
                {spent > 0 && `${formatRate(spent)} total`}
              </td>
            </tr>
          </tfoot>
        </table>
      )}
    </main>
  )
}
