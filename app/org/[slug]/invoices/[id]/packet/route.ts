import type { NextRequest } from "next/server"

import { invoicePacket } from "@/lib/invoice-packet"
import { getInvoiceDetail } from "@/lib/invoices"
import { getOrganization } from "@/lib/organizations"

/**
 * The invoice packet as one PDF: the invoice, then the rate con, BOL, POD
 * and lumper receipts. Opens in the browser; ?download=1 saves it instead.
 */
export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/org/[slug]/invoices/[id]/packet">
) {
  const { slug, id } = await ctx.params
  const organization = await getOrganization(slug)
  const detail = organization
    ? await getInvoiceDetail(organization.id, id)
    : null
  if (!organization || !detail) {
    return new Response("Invoice not found", { status: 404 })
  }

  let packet
  try {
    packet = await invoicePacket(organization.id, detail)
  } catch (error) {
    return new Response(
      error instanceof Error ? error.message : "The packet couldn't be made.",
      { status: 502 }
    )
  }

  const download = request.nextUrl.searchParams.get("download") === "1"
  return new Response(Buffer.from(packet.pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${packet.fileName}"`,
      "Cache-Control": "private, no-store",
    },
  })
}
