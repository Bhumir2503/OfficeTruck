import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import { sendInvoiceEmail } from "@/lib/email/invoice-email"
import {
  balanceDue,
  billTo,
  daysBetween,
  formatInvoiceDate,
  localToday,
} from "@/lib/invoice-format"
import {
  invoicePacket,
  invoicePageData,
  isFactored,
} from "@/lib/invoice-packet"
import { getInvoiceDetail, getLoadsToInvoice } from "@/lib/invoices"
import { formatRate } from "@/lib/load-format"
import { runAsSystem } from "@/lib/supabase/server"

// Invoicing on its own (see the auto_invoicing migration): delivered loads
// with their paperwork in get an invoice, emailed with the packet to the
// broker or factoring company, and unpaid invoices get reminders. Runs from
// /api/cron/invoices with the secret key; the same code as the Send and
// Remind buttons does the work, inside runAsSystem().

/** Reminders: the day after it's due, then every week, three at most. */
const REMINDER_EVERY_DAYS = 7
const MAX_REMINDERS = 3

export type AutoInvoiceResult = {
  organization: string
  load: string
  invoice?: number
  /** What happened, or would with a dry run. */
  outcome:
    | "sent"
    | "reminded"
    | "drafted"
    | "would_send"
    | "would_draft"
    | "would_remind"
    | "failed"
  to?: string[]
  note?: string
}

type Organization = {
  id: string
  name: string
  auto_invoice: boolean
  auto_invoice_since: string | null
  auto_invoice_reminders: boolean
}

export async function runAutoInvoicing(
  admin: SupabaseClient,
  { dryRun = false }: { dryRun?: boolean } = {}
): Promise<AutoInvoiceResult[]> {
  return runAsSystem(admin, async () => {
    const { data: organizations, error } = await admin
      .from("organizations")
      .select(
        "id, name, auto_invoice, auto_invoice_since, auto_invoice_reminders"
      )
      .or("auto_invoice.eq.true,auto_invoice_reminders.eq.true")
    if (error) throw error

    const results: AutoInvoiceResult[] = []
    for (const organization of (organizations ?? []) as Organization[]) {
      if (organization.auto_invoice && organization.auto_invoice_since) {
        results.push(...(await invoiceDelivered(admin, organization, dryRun)))
      }
      if (organization.auto_invoice_reminders) {
        results.push(...(await remindUnpaid(admin, organization, dryRun)))
      }
    }
    return results
  })
}

/** Each customer's own setting: on, off, or null to follow the company. */
async function brokerSettings(admin: SupabaseClient, loadIds: string[]) {
  const settings = new Map<string, boolean | null>()
  if (!loadIds.length) return settings
  const { data } = await admin
    .from("loads")
    .select("id, broker:brokers!loads_broker_fkey (auto_invoice)")
    .in("id", loadIds)
  for (const row of data ?? []) {
    const broker = row.broker as unknown as {
      auto_invoice: boolean | null
    } | null
    settings.set(row.id, broker?.auto_invoice ?? null)
  }
  return settings
}

/** The packet's email attachments. */
function attachments(packet: Awaited<ReturnType<typeof invoicePacket>>) {
  return [
    { filename: packet.fileName, content: packet.pdf },
    ...packet.separate.map((file) => ({
      filename: file.file_name,
      content: file.bytes,
    })),
  ]
}

/**
 * Delivered loads with every document in, delivered since the company
 * turned this on: make the invoice and email the packet.
 */
async function invoiceDelivered(
  admin: SupabaseClient,
  organization: Organization,
  dryRun: boolean
): Promise<AutoInvoiceResult[]> {
  const since = organization.auto_invoice_since!.slice(0, 10)
  const ready = (await getLoadsToInvoice(organization.id)).filter(
    (load) =>
      load.status === "delivered" &&
      load.missing.length === 0 &&
      Number(load.rate) > 0 &&
      (load.delivered_on ?? "") >= since
  )
  const settings = await brokerSettings(
    admin,
    ready.map((load) => load.id)
  )
  const results: AutoInvoiceResult[] = []
  for (const load of ready) {
    if (settings.get(load.id) === false) continue
    const base = { organization: organization.name, load: load.reference }

    if (dryRun) {
      results.push({ ...base, outcome: "would_send" })
      continue
    }
    const { data: id, error } = await admin.rpc("create_invoice", {
      target_load: load.id,
    })
    if (error) {
      results.push({ ...base, outcome: "failed", note: error.message })
      continue
    }
    results.push(await sendDraft(admin, organization, id as string, base))
  }
  return results
}

/** Emails a new draft's packet, or leaves it a draft when it can't be. */
async function sendDraft(
  admin: SupabaseClient,
  organization: Organization,
  invoiceId: string,
  base: { organization: string; load: string }
): Promise<AutoInvoiceResult> {
  const detail = await getInvoiceDetail(organization.id, invoiceId)
  if (!detail) {
    return { ...base, outcome: "failed", note: "The invoice disappeared." }
  }
  const number = detail.invoice.number
  const to = billTo(detail.load.broker_name, detail.broker, detail.factoring)
  if (to.method === "portal") {
    return {
      ...base,
      invoice: number,
      outcome: "drafted",
      note: `${to.name} takes invoices through their portal: upload it there.`,
    }
  }
  if (!to.emails.length) {
    return {
      ...base,
      invoice: number,
      outcome: "drafted",
      note: `${to.name} has no billing email.`,
    }
  }

  try {
    const packet = await invoicePacket(organization.id, detail)
    const page = invoicePageData(detail)
    const emailError = await sendInvoiceEmail({
      to: to.emails,
      replyTo: detail.company.email,
      companyName: page.from.name,
      number,
      reference: detail.load.reference,
      total: formatRate(page.total),
      dueOn: formatInvoiceDate(page.due_on),
      factoringName:
        isFactored(detail) && detail.factoring ? detail.factoring.name : null,
      message: null,
      attachments: attachments(packet),
    })
    if (emailError) {
      return {
        ...base,
        invoice: number,
        outcome: "drafted",
        note: `Left a draft: the email failed. ${emailError}`,
      }
    }
  } catch (error) {
    return {
      ...base,
      invoice: number,
      outcome: "drafted",
      note: `Left a draft: ${error instanceof Error ? error.message : "the packet couldn't be built."}`,
    }
  }

  const { error } = await admin.rpc("send_invoice", {
    target_invoice: invoiceId,
    via: "email",
    recipients: to.emails,
  })
  if (error) {
    return {
      ...base,
      invoice: number,
      outcome: "failed",
      to: to.emails,
      note: `Emailed, but not recorded as sent: ${error.message}`,
    }
  }
  return { ...base, invoice: number, outcome: "sent", to: to.emails }
}

/**
 * Unpaid invoices past due: a reminder the day after, then weekly, three at
 * most. Factored invoices are the factoring company's to collect.
 */
async function remindUnpaid(
  admin: SupabaseClient,
  organization: Organization,
  dryRun: boolean
): Promise<AutoInvoiceResult[]> {
  const today = localToday()
  const recent = new Date(
    Date.now() - REMINDER_EVERY_DAYS * 86_400_000
  ).toISOString()
  const { data, error } = await admin
    .from("invoices")
    .select(
      "id, number, load_id, due_on, sent_to, reminder_count, last_reminded_at"
    )
    .eq("organization_id", organization.id)
    .eq("status", "sent")
    .eq("factored", false)
    .lt("due_on", today)
    .lt("reminder_count", MAX_REMINDERS)
    .or(`last_reminded_at.is.null,last_reminded_at.lt.${recent}`)
  if (error) throw error
  const settings = await brokerSettings(
    admin,
    (data ?? []).map((invoice) => invoice.load_id)
  )

  const results: AutoInvoiceResult[] = []
  for (const row of data ?? []) {
    if (settings.get(row.load_id) === false) continue
    const detail = await getInvoiceDetail(organization.id, row.id)
    if (!detail) continue
    const base = {
      organization: organization.name,
      load: detail.load.reference,
      invoice: row.number as number,
    }
    const bill = billTo(
      detail.load.broker_name,
      detail.broker,
      detail.factoring
    )
    const to = (row.sent_to as string[]).length
      ? (row.sent_to as string[])
      : bill.emails
    if (!to.length) {
      results.push({
        ...base,
        outcome: "failed",
        note: `${bill.name} has no billing email to remind.`,
      })
      continue
    }
    if (dryRun) {
      results.push({ ...base, outcome: "would_remind", to })
      continue
    }
    try {
      const packet = await invoicePacket(organization.id, detail)
      const page = invoicePageData(detail)
      const emailError = await sendInvoiceEmail({
        to,
        replyTo: detail.company.email,
        companyName: page.from.name,
        number: row.number as number,
        reference: detail.load.reference,
        total: formatRate(page.total),
        dueOn: formatInvoiceDate(page.due_on),
        factoringName: null,
        message: null,
        reminder: {
          balance: formatRate(
            balanceDue(page.total, detail.invoice.paid_amount)
          ),
          daysLate: daysBetween(page.due_on, today),
        },
        attachments: attachments(packet),
      })
      if (emailError) {
        results.push({ ...base, outcome: "failed", to, note: emailError })
        continue
      }
    } catch (error) {
      results.push({
        ...base,
        outcome: "failed",
        note: error instanceof Error ? error.message : "The packet failed.",
      })
      continue
    }
    const { error: recordError } = await admin.rpc("record_invoice_reminder", {
      target_invoice: row.id,
    })
    results.push({
      ...base,
      outcome: recordError ? "failed" : "reminded",
      to,
      ...(recordError ? { note: recordError.message } : {}),
    })
  }
  return results
}
