"use server"

import { refresh } from "next/cache"

import { sendInvoiceEmail } from "@/lib/email/invoice-email"
import {
  balanceDue,
  daysBetween,
  formatInvoiceDate,
  localToday,
} from "@/lib/invoice-format"
import {
  invoicePacket,
  invoicePageData,
  isFactored,
} from "@/lib/invoice-packet"
import { getInvoiceDetail } from "@/lib/invoices"
import { formatRate } from "@/lib/load-format"
import { getMyOrganizations, getUser } from "@/lib/organizations"
import {
  emailInvoiceSchema,
  type EmailInvoiceValues,
  invoiceDraftSchema,
  type InvoiceDraftValues,
  invoiceNumberSchema,
  type InvoiceNumberValues,
  markSentSchema,
  pastInvoiceSchema,
  type PastInvoiceValues,
  type MarkSentValues,
  paymentSchema,
  type PaymentValues,
  reminderSchema,
  type ReminderValues,
  voidInvoiceSchema,
  type VoidInvoiceValues,
} from "@/lib/schemas/invoice"
import { createClient } from "@/lib/supabase/server"

export type ActionResult = { error: string } | { ok: true }

const NOT_MEMBER = { error: "You aren't a member of this organization." }

async function isMember(organizationId: string) {
  const user = await getUser()
  return (
    !!user &&
    (await getMyOrganizations()).some((org) => org.id === organizationId)
  )
}

/** The invoice functions raise with a readable message and a hint saying which. */
function rpcError(error: { message: string; hint?: string | null }) {
  return error.hint ? error.message : `Something went wrong: ${error.message}`
}

/** A draft invoice for a delivered or TONU load. Returns its id. */
export async function createInvoice(
  organizationId: string,
  loadId: string
): Promise<{ error: string } | { ok: true; id: string }> {
  if (!(await isMember(organizationId))) return NOT_MEMBER
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("create_invoice", {
    target_load: loadId,
  })
  if (error) {
    return { error: rpcError(error) }
  }
  refresh()
  return { ok: true, id: data as string }
}

export async function updateInvoiceDraft(
  organizationId: string,
  invoiceId: string,
  values: InvoiceDraftValues
): Promise<ActionResult> {
  if (!(await isMember(organizationId))) return NOT_MEMBER
  const parsed = invoiceDraftSchema.safeParse({
    notes: values.notes ?? "",
    terms_days: String(values.terms_days),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }
  const supabase = await createClient()
  const { error } = await supabase.rpc("update_invoice_draft", {
    target_invoice: invoiceId,
    new_notes: parsed.data.notes ?? "",
    new_terms: parsed.data.terms_days,
  })
  if (error) {
    return { error: rpcError(error) }
  }
  refresh()
  return { ok: true }
}

/** Changes a draft's number. Later invoices carry on from it. */
export async function setInvoiceNumber(
  organizationId: string,
  invoiceId: string,
  values: InvoiceNumberValues
): Promise<ActionResult> {
  if (!(await isMember(organizationId))) return NOT_MEMBER
  const parsed = invoiceNumberSchema.safeParse({
    number: String(values.number),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }
  const supabase = await createClient()
  const { error } = await supabase.rpc("set_invoice_number", {
    target_invoice: invoiceId,
    new_number: parsed.data.number,
  })
  if (error) {
    // Two drafts renumbered at once can still meet the unique constraint.
    return {
      error:
        error.code === "23505"
          ? `Invoice ${parsed.data.number} already exists. Choose another number.`
          : rpcError(error),
    }
  }
  refresh()
  return { ok: true }
}

export async function deleteInvoiceDraft(
  organizationId: string,
  invoiceId: string
): Promise<ActionResult> {
  if (!(await isMember(organizationId))) return NOT_MEMBER
  const supabase = await createClient()
  const { error } = await supabase.rpc("delete_invoice_draft", {
    target_invoice: invoiceId,
  })
  if (error) {
    return { error: rpcError(error) }
  }
  refresh()
  return { ok: true }
}

/**
 * Emails the packet (the invoice with the rate con, BOL, POD and lumper
 * receipts behind it) and, once Resend has it, records the send. A failed
 * email leaves the invoice a draft.
 */
export async function emailInvoice(
  organizationId: string,
  invoiceId: string,
  values: EmailInvoiceValues
): Promise<ActionResult> {
  if (!(await isMember(organizationId))) return NOT_MEMBER
  const parsed = emailInvoiceSchema.safeParse({
    to: values.to.join(","),
    message: values.message ?? "",
    sent_on: values.sent_on,
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const detail = await getInvoiceDetail(organizationId, invoiceId)
  if (!detail) {
    return { error: "That invoice doesn't exist anymore." }
  }
  if (detail.invoice.status !== "draft") {
    return { error: "This invoice has already been sent." }
  }
  if (detail.charges.length === 0) {
    return { error: "Add the load's charges before sending the invoice." }
  }

  let packet
  try {
    packet = await invoicePacket(organizationId, detail)
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "The packet couldn't be put together. Try again.",
    }
  }

  const page = invoicePageData(detail, parsed.data.sent_on)
  const user = await getUser()
  const emailError = await sendInvoiceEmail({
    to: parsed.data.to,
    replyTo:
      detail.company.email ||
      (typeof user?.email === "string" ? user.email : null),
    companyName: page.from.name,
    number: detail.invoice.number,
    reference: detail.load.reference,
    total: formatRate(page.total),
    dueOn: formatInvoiceDate(page.due_on),
    factoringName:
      isFactored(detail) && detail.factoring ? detail.factoring.name : null,
    message: parsed.data.message,
    attachments: [
      { filename: packet.fileName, content: packet.pdf },
      ...packet.separate.map((file) => ({
        filename: file.file_name,
        content: file.bytes,
      })),
    ],
  })
  if (emailError) {
    return { error: `The invoice wasn't sent. ${emailError}` }
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc("send_invoice", {
    target_invoice: invoiceId,
    via: "email",
    recipients: parsed.data.to,
    sent_on: parsed.data.sent_on ?? null,
  })
  if (error) {
    return {
      error: `The email went to ${parsed.data.to.join(", ")}, but it couldn't be recorded: ${error.message}. Mark it sent by hand.`,
    }
  }
  refresh()
  return { ok: true }
}

/**
 * Emails a reminder about an unpaid invoice, with the packet attached
 * again, and records it on the invoice.
 */
export async function sendInvoiceReminder(
  organizationId: string,
  invoiceId: string,
  values: ReminderValues
): Promise<ActionResult> {
  if (!(await isMember(organizationId))) return NOT_MEMBER
  const parsed = reminderSchema.safeParse({
    to: values.to.join(","),
    message: values.message ?? "",
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const detail = await getInvoiceDetail(organizationId, invoiceId)
  if (!detail) {
    return { error: "That invoice doesn't exist anymore." }
  }
  if (detail.invoice.status !== "sent") {
    return { error: "Only an unpaid invoice gets a reminder." }
  }

  let packet
  try {
    packet = await invoicePacket(organizationId, detail)
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "The packet couldn't be put together. Try again.",
    }
  }

  const page = invoicePageData(detail)
  const user = await getUser()
  const emailError = await sendInvoiceEmail({
    to: parsed.data.to,
    replyTo:
      detail.company.email ||
      (typeof user?.email === "string" ? user.email : null),
    companyName: page.from.name,
    number: detail.invoice.number,
    reference: detail.load.reference,
    total: formatRate(page.total),
    dueOn: formatInvoiceDate(page.due_on),
    factoringName:
      isFactored(detail) && detail.factoring ? detail.factoring.name : null,
    message: parsed.data.message,
    reminder: {
      balance: formatRate(balanceDue(page.total, detail.invoice.paid_amount)),
      daysLate: daysBetween(page.due_on, localToday()),
    },
    attachments: [
      { filename: packet.fileName, content: packet.pdf },
      ...packet.separate.map((file) => ({
        filename: file.file_name,
        content: file.bytes,
      })),
    ],
  })
  if (emailError) {
    return { error: `The reminder wasn't sent. ${emailError}` }
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc("record_invoice_reminder", {
    target_invoice: invoiceId,
  })
  if (error) {
    return {
      error: `The reminder went to ${parsed.data.to.join(", ")}, but it couldn't be recorded: ${error.message}`,
    }
  }
  refresh()
  return { ok: true }
}

/** Records a send done outside OfficeTruck, like a broker's portal. */
export async function markInvoiceSent(
  organizationId: string,
  invoiceId: string,
  values: MarkSentValues
): Promise<ActionResult> {
  if (!(await isMember(organizationId))) return NOT_MEMBER
  const parsed = markSentSchema.safeParse(values)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }
  const supabase = await createClient()
  const { error } = await supabase.rpc("send_invoice", {
    target_invoice: invoiceId,
    via: parsed.data.via,
    recipients: [],
    sent_on: parsed.data.sent_on ?? null,
  })
  if (error) {
    return { error: rpcError(error) }
  }
  refresh()
  return { ok: true }
}

export async function recordInvoicePayment(
  organizationId: string,
  invoiceId: string,
  values: PaymentValues
): Promise<ActionResult> {
  if (!(await isMember(organizationId))) return NOT_MEMBER
  const parsed = paymentSchema.safeParse({
    ...values,
    amount: String(values.amount),
    reference: values.reference ?? "",
    close_out: values.close_out,
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }
  const supabase = await createClient()
  const { error } = await supabase.rpc("record_invoice_payment", {
    target_invoice: invoiceId,
    paid: parsed.data.paid_on,
    amount: parsed.data.amount,
    reference: parsed.data.reference ?? "",
    close_out: parsed.data.close_out,
  })
  if (error) {
    return { error: rpcError(error) }
  }
  refresh()
  return { ok: true }
}

/**
 * Records a draft as sent on an earlier day, for invoices sent before the
 * company used the app. Nothing is emailed; the invoice and due dates count
 * from that day, so a payment from back then can be recorded.
 */
export async function recordPastInvoice(
  organizationId: string,
  invoiceId: string,
  values: PastInvoiceValues
): Promise<ActionResult> {
  if (!(await isMember(organizationId))) return NOT_MEMBER
  const parsed = pastInvoiceSchema.safeParse(values)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }
  const supabase = await createClient()
  const { error } = await supabase.rpc("record_past_invoice", {
    target_invoice: invoiceId,
    via: parsed.data.via,
    sent_on: parsed.data.sent_on,
  })
  if (error) {
    return { error: rpcError(error) }
  }
  refresh()
  return { ok: true }
}

/** Takes back a payment recorded by mistake. */
export async function undoInvoicePayment(
  organizationId: string,
  paymentId: string
): Promise<ActionResult> {
  if (!(await isMember(organizationId))) return NOT_MEMBER
  const supabase = await createClient()
  const { error } = await supabase.rpc("undo_invoice_payment", {
    target_payment: paymentId,
  })
  if (error) {
    return { error: rpcError(error) }
  }
  refresh()
  return { ok: true }
}

export async function voidInvoice(
  organizationId: string,
  invoiceId: string,
  values: VoidInvoiceValues
): Promise<ActionResult> {
  if (!(await isMember(organizationId))) return NOT_MEMBER
  const parsed = voidInvoiceSchema.safeParse(values)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }
  const supabase = await createClient()
  const { error } = await supabase.rpc("void_invoice", {
    target_invoice: invoiceId,
    reason: parsed.data.reason,
  })
  if (error) {
    return { error: rpcError(error) }
  }
  refresh()
  return { ok: true }
}
