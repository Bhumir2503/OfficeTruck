import "server-only"

import {
  addressLines,
  billTo,
  type InvoiceLine,
  localToday,
  packetFileName,
} from "@/lib/invoice-format"
import {
  buildInvoicePacket,
  type InvoicePage,
  type PacketFile,
} from "@/lib/invoice-pdf"
import { invoiceLines, packetFiles, type InvoiceDetail } from "@/lib/invoices"
import { DOCUMENT_LABELS } from "@/lib/load-document-format"
import { formatStopDate } from "@/lib/load-format"
import { CHARGE_KIND_LABELS, EQUIPMENT_LABELS } from "@/lib/schemas/load"
import { createClient } from "@/lib/supabase/server"

/** "YYYY-MM-DD" plus whole days. */
function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

/** "Linehaul", or "Other: Pallet jack" when a line has its own description. */
export function lineLabel(line: Pick<InvoiceLine, "kind" | "description">) {
  const kind = CHARGE_KIND_LABELS[line.kind] ?? "Charge"
  if (!line.description) return kind
  return line.kind === "other"
    ? line.description
    : `${kind}: ${line.description}`
}

/** Whether the invoice goes to the factoring company. */
export function isFactored(detail: InvoiceDetail) {
  if (detail.invoice.factored !== null) {
    return detail.invoice.factored
  }
  return (
    billTo(detail.load.broker_name, detail.broker, detail.factoring).kind ===
    "factoring"
  )
}

/**
 * What the invoice page says. A draft is dated today, so the preview shows
 * what it'll look like if it's sent now.
 */
export function invoicePageData(
  detail: InvoiceDetail,
  today = localToday()
): InvoicePage {
  const { invoice, load, stops, company, broker, factoring } = detail
  const lines = invoiceLines(detail)
  const factored = isFactored(detail)
  const invoiceDate = invoice.invoice_date ?? today
  const pickup = stops.find((stop) => stop.kind === "pickup")
  const delivery = stops.findLast((stop) => stop.kind === "delivery")
  const stopText = (
    stop: (typeof stops)[number] | undefined,
    location: string,
    start: string
  ) =>
    `${stop?.facility ? `${stop.facility}, ` : ""}${stop?.location ?? location} · ${formatStopDate(stop?.appointment_start ?? start)}`

  const freight = [
    load.equipment ? EQUIPMENT_LABELS[load.equipment] : null,
    load.weight_lbs ? `${load.weight_lbs.toLocaleString("en-US")} lbs` : null,
    load.commodity,
  ].filter(Boolean)

  return {
    number: invoice.number,
    draft: invoice.status === "draft",
    invoice_date: invoiceDate,
    due_on: invoice.due_on ?? addDays(invoiceDate, invoice.terms_days),
    terms_days: invoice.terms_days,
    from: {
      name: company.legal_name || company.name,
      logo_url: detail.logoUrl,
      lines: addressLines({
        line1: company.address_line1,
        line2: company.address_line2,
        city: company.city,
        state: company.state,
        postal_code: company.postal_code,
      }),
      contact:
        [company.phone, company.email].filter(Boolean).join(" · ") || null,
      ids:
        [
          company.mc_number ? `MC ${company.mc_number}` : null,
          company.dot_number ? `USDOT ${company.dot_number}` : null,
        ]
          .filter(Boolean)
          .join(" · ") || null,
    },
    bill_to: {
      name: broker?.legal_name ?? load.broker_name,
      lines: [
        ...(broker?.dba_name ? [`DBA ${broker.dba_name}`] : []),
        ...(broker
          ? addressLines({
              line1: broker.address_line1,
              line2: broker.address_line2,
              city: broker.city,
              state: broker.state,
              postal_code: broker.postal_code,
            })
          : []),
        ...(broker?.mc_number ? [`MC ${broker.mc_number}`] : []),
      ],
    },
    remit_to:
      factored && factoring
        ? {
            name: factoring.name,
            lines: addressLines({
              line1: factoring.remit_line1,
              line2: factoring.remit_line2,
              city: factoring.remit_city,
              state: factoring.remit_state,
              postal_code: factoring.remit_postal_code,
            }),
          }
        : null,
    load: {
      reference: load.reference,
      reference_numbers: load.reference_numbers,
      pickup: stopText(pickup, load.pickup_location, load.pickup_start),
      delivery: stopText(delivery, load.delivery_location, load.delivery_start),
      freight: freight.length ? freight.join(" · ") : null,
      stops: stops.length,
    },
    lines: lines.map((line) => ({
      label: lineLabel(line),
      amount: Number(line.amount),
    })),
    total: lines.reduce((sum, line) => sum + Number(line.amount), 0),
    notes: invoice.notes,
  }
}

/** Downloads the load's rate con, BOL, POD and lumper receipts. */
async function downloadFiles(
  organizationId: string,
  loadId: string
): Promise<PacketFile[]> {
  const supabase = await createClient()
  const files = await packetFiles(organizationId, loadId)
  const downloaded = await Promise.all(
    files.map(async (file) => {
      const { data, error } = await supabase.storage
        .from("load-documents")
        .download(file.path)
      if (error || !data) {
        throw new Error(
          `Couldn't read the ${DOCUMENT_LABELS[file.kind]} (${file.file_name}). Try again, or upload it again.`
        )
      }
      return {
        label: DOCUMENT_LABELS[file.kind],
        file_name: file.file_name,
        content_type: file.content_type,
        bytes: new Uint8Array(await data.arrayBuffer()),
      }
    })
  )
  return downloaded
}

/** The company logo's bytes, or null when there's none or it can't be read. */
async function downloadLogo(url: string | null) {
  if (!url) return null
  try {
    const response = await fetch(url, { cache: "no-store" })
    if (!response.ok) return null
    return new Uint8Array(await response.arrayBuffer())
  } catch {
    return null
  }
}

/**
 * The packet: the invoice page with the documents behind it, as one PDF,
 * plus any photos that couldn't go in it.
 */
export async function invoicePacket(
  organizationId: string,
  detail: InvoiceDetail
) {
  const [files, logo] = await Promise.all([
    downloadFiles(organizationId, detail.load.id),
    downloadLogo(detail.logoUrl),
  ])
  const { pdf, separate } = await buildInvoicePacket(
    invoicePageData(detail),
    files,
    logo
  )
  return {
    fileName: packetFileName(detail.invoice.number, detail.load.reference),
    pdf,
    separate,
  }
}
