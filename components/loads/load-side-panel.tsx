"use client"

import { cn } from "cn"
import {
  ArrowRight,
  CheckCircle2,
  Circle,
  Loader2,
  Plus,
  ReceiptText,
  Send,
  Upload,
  X,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useRef, useState } from "react"
import { toast } from "sonner"

import {
  markLoadComplete,
  removeLoadDocument,
  sendToDriver,
  updateLoadStatus,
} from "@/app/org/[slug]/loads/actions"
import { createInvoice } from "@/app/org/[slug]/invoices/actions"
import { AssignDialog } from "@/components/loads/assign-dialog"
import { DocumentLink } from "@/components/loads/document-viewer"
import { MoneyLine, Panel } from "@/components/side-panel"
import { Button } from "@/components/ui/button"
import type { LoadDispatch } from "@/lib/dispatch"
import { formatInvoiceDate, INVOICE_STATE_LABELS } from "@/lib/invoice-format"
import type { LoadInvoice } from "@/lib/invoices"
import type { DriverOption } from "@/lib/drivers"
import { formatPay, loadDriverPay } from "@/lib/driver-format"
import {
  DOCUMENT_LABELS,
  INVOICED_STATUSES,
  missingDocuments,
  requiredDocuments,
  type DocumentKind,
} from "@/lib/load-document-format"
import { DOCUMENT_TYPES, uploadLoadDocument } from "@/lib/load-document-upload"
import type { LoadDocument } from "@/lib/load-documents"
import {
  EXPENSE_KINDS,
  EXPENSE_LABELS,
  expenseTotals,
} from "@/lib/load-expense-format"
import type { LoadExpense } from "@/lib/load-expenses"
import { formatRate } from "@/lib/load-format"
import type { Load, LoadCharge } from "@/lib/loads"
import { LOAD_STATUS_LABELS, type LoadStatus } from "@/lib/schemas/load"
import type { TruckOption } from "@/lib/trucks"

type Step = {
  title: string
  detail: string
  action:
    | { type: "assign" }
    | { type: "send" }
    | { type: "upload"; kind: DocumentKind }
    | { type: "status"; to: LoadStatus; label: string }
    /** Make the draft invoice, or open the one there is. */
    | { type: "invoice"; label: string }
    | null
  /** A second, quieter choice, e.g. factored instead of paid. */
  alternative?: { to: LoadStatus | "complete"; label: string }
}

const firstName = (name: string | null | undefined) => name?.split(" ")[0]

/** What to do next with the load, and the one button that does it. */
function nextStep(
  load: Load,
  missing: DocumentKind[],
  dispatch: LoadDispatch | null,
  invoice: LoadInvoice | null
): Step {
  const has = (kind: DocumentKind) => !missing.includes(kind)
  const upload = (kind: DocumentKind, detail: string): Step => ({
    title: `Upload the ${DOCUMENT_LABELS[kind]}`,
    detail,
    action: { type: "upload", kind },
  })

  switch (load.status) {
    case "booked":
      return load.driver && load.truck_link
        ? {
            title: `Notify ${firstName(load.driver.full_name)}`,
            detail:
              "Sends them the stops, appointments, pickup numbers and rate con. The load moves to dispatched.",
            action: { type: "send" },
            alternative: { to: "complete", label: "Mark complete" },
          }
        : {
            title: "Assign a truck and driver",
            detail: "Then send the load to the driver.",
            action: { type: "assign" },
            alternative: { to: "complete", label: "Mark complete" },
          }
    case "dispatched":
    case "loaded": {
      // The status moves on its own from the BOL, POD and check-ins; Mark
      // complete is for when they won't come.
      const complete = { to: "complete" as const, label: "Mark complete" }
      if (!has("bol") && load.status === "dispatched") {
        return {
          ...upload(
            "bol",
            dispatch?.seen_at
              ? `${firstName(load.driver?.full_name) ?? "The driver"} has the load. The signed BOL moves it to in transit.`
              : "The signed BOL moves the load to in transit."
          ),
          alternative: complete,
        }
      }
      return {
        ...upload(
          "pod",
          "The signed proof of delivery moves the load to delivered."
        ),
        alternative: complete,
      }
    }
    case "delivered": {
      const first = missing[0]
      if (first) {
        return upload(
          first,
          `Needed before the load can be invoiced. ${missing.length > 1 ? `${missing.length} documents are missing.` : ""}`.trim()
        )
      }
      return invoice
        ? {
            title: `Send invoice ${invoice.number}`,
            detail:
              "The draft is ready. Check it, then email it with the rate con, BOL and POD attached.",
            action: {
              type: "invoice",
              label: `Open invoice ${invoice.number}`,
            },
          }
        : {
            title: "Invoice the broker",
            detail:
              "Every document is in. Make a draft invoice with your next number; it goes out with the paperwork attached.",
            action: { type: "invoice", label: "Create invoice" },
          }
    }
    case "invoiced":
    case "factored":
      if (invoice?.status === "sent") {
        return {
          title: load.status === "factored" ? "Factored" : "Wait for payment",
          detail: invoice.due_on
            ? `Invoice ${invoice.number} is due ${formatInvoiceDate(invoice.due_on)}. Record the payment on it when the money lands.`
            : `Record the payment on invoice ${invoice.number} when the money lands.`,
          action: { type: "invoice", label: `Open invoice ${invoice.number}` },
        }
      }
      // Billed outside OfficeTruck, before invoices existed.
      if (load.status === "invoiced") {
        return {
          title: "Wait for payment",
          detail: load.broker?.payment_terms_days
            ? `Terms are net ${load.broker.payment_terms_days}.`
            : "Mark it paid when the money lands.",
          action: { type: "status", to: "paid", label: "Mark paid" },
          alternative: { to: "factored", label: "Factored instead" },
        }
      }
      return {
        title: "All done",
        detail: "This load is factored. Nothing left to do.",
        action: null,
      }
    case "paid":
      return {
        title: "All done",
        detail: `This load is ${LOAD_STATUS_LABELS[load.status].toLowerCase()}. Nothing left to do.`,
        action: invoice
          ? { type: "invoice", label: `Open invoice ${invoice.number}` }
          : null,
      }
    case "tonu":
      if (invoice?.status === "draft" || invoice?.status === "sent") {
        return {
          title:
            invoice.status === "draft"
              ? `Send invoice ${invoice.number}`
              : "Wait for payment",
          detail: "Bill the broker for the TONU.",
          action: { type: "invoice", label: `Open invoice ${invoice.number}` },
        }
      }
      if (!invoice) {
        return {
          title: "Bill the TONU",
          detail:
            "Make an invoice for the TONU charge, or reopen the load from the status menu to book it again.",
          action: { type: "invoice", label: "Create invoice" },
        }
      }
      return {
        title: "TONU",
        detail:
          "The TONU is paid. Reopen it from the status menu to book it again.",
        action: null,
      }
    case "cancelled":
      return {
        title: "Cancelled",
        detail: "Reopen it from the status menu to book it again.",
        action: null,
      }
  }
}

/**
 * The right-hand side of the load page: the next step with one button for
 * it, the documents that decide whether the load can be billed, and what
 * the load makes.
 */
export function LoadSidePanel({
  organizationId,
  load,
  charges,
  documents,
  expenses,
  dispatch,
  trucks,
  drivers,
  trucksBase,
  driversBase,
  loadsBase,
  invoice,
  invoicesBase,
}: {
  organizationId: string
  load: Load
  charges: LoadCharge[]
  documents: LoadDocument[]
  expenses: LoadExpense[]
  dispatch: LoadDispatch | null
  /** For assigning a truck and driver from the next step. */
  trucks: TruckOption[]
  drivers: DriverOption[]
  /** /org/<slug>/equipment */
  trucksBase: string
  /** /org/<slug>/drivers */
  driversBase: string
  /** /org/<slug>/loads */
  loadsBase: string
  /** The load's live invoice, if it has one. */
  invoice: LoadInvoice | null
  /** /org/<slug>/invoices */
  invoicesBase: string
}) {
  const router = useRouter()
  const [assigning, setAssigning] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  // Which kind the file picker is choosing for.
  const pickingRef = useRef<DocumentKind>("bol")

  // A lumper receipt attached to an expense counts as the lumper receipt.
  const lumperReceipt = expenses.find(
    (expense) => expense.kind === "lumper" && expense.receipt_url
  )
  const required = requiredDocuments(charges)
  const missing = missingDocuments(charges, [
    ...documents,
    ...(lumperReceipt ? [{ kind: "lumper_receipt" as const }] : []),
  ])
  const ready = missing.length === 0
  const step = nextStep(load, missing, dispatch, invoice)
  const invoiced = INVOICED_STATUSES.includes(load.status)
  const shown: DocumentKind[] = [
    ...required,
    ...(documents.some((document) => document.kind === "other")
      ? (["other"] as const)
      : []),
  ]

  const revenue = Number(load.rate)
  const pay = loadDriverPay(load)
  // Expenses by what they were for, in the order kinds are listed.
  const spent = EXPENSE_KINDS.map((kind) => ({
    kind,
    total: expenseTotals(expenses.filter((expense) => expense.kind === kind))
      .total,
  })).filter((line) => line.total > 0)
  const expenseTotal = expenseTotals(expenses).total
  const locked = formatPay(load.driver_pay_type, load.driver_pay_rate)
  const allMiles = (load.miles ?? 0) + (load.empty_miles ?? 0)

  function pick(kind: DocumentKind) {
    pickingRef.current = kind
    fileRef.current?.click()
  }

  async function upload(files: FileList | null) {
    const kind = pickingRef.current
    if (!files?.length) return
    setBusy(`upload:${kind}`)
    for (const file of Array.from(files)) {
      const error = await uploadLoadDocument(
        organizationId,
        load.id,
        kind,
        file
      )
      if (error) {
        toast.error(error)
        setBusy(null)
        return
      }
    }
    setBusy(null)
    // On the road, the status follows the BOL and POD (see
    // sync_load_status_from_documents); say so, since the badge changes too.
    const moved =
      kind === "bol" && load.status === "dispatched"
        ? ` Load ${load.reference} is in transit.`
        : kind === "pod" &&
            (load.status === "dispatched" || load.status === "loaded")
          ? ` Load ${load.reference} is delivered.`
          : ""
    toast.success(
      `${DOCUMENT_LABELS[kind]} added${files.length > 1 ? ` (${files.length} files)` : ""}.${moved}`
    )
  }

  async function remove(document: LoadDocument) {
    setBusy(`remove:${document.id}`)
    const result = await removeLoadDocument(organizationId, document.id)
    setBusy(null)
    if ("error" in result) {
      toast.error(result.error)
    } else {
      // Removing a BOL or POD can move the load back. Where to depends on
      // what's left and the driver's check-ins, which the database decides.
      const onTheRoad = ["dispatched", "loaded", "delivered"].includes(
        load.status
      )
      toast.success(
        `${DOCUMENT_LABELS[document.kind]} removed.${
          onTheRoad && (document.kind === "bol" || document.kind === "pod")
            ? " The status now matches what's uploaded."
            : ""
        }`
      )
    }
  }

  async function send() {
    setBusy("send")
    const result = await sendToDriver(organizationId, load.id)
    setBusy(null)
    if ("error" in result) {
      toast.error(result.error)
      return
    }
    const name = load.driver?.full_name
    if (result.emailError) {
      toast.warning(
        `Load ${load.reference} sent to ${name}. ${result.emailError}`
      )
    } else {
      toast.success(`Load ${load.reference} sent to ${name}.`)
    }
    if (result.warning) {
      toast.warning(result.warning)
    }
  }

  async function complete() {
    setBusy("status:complete")
    const result = await markLoadComplete(organizationId, load.id)
    setBusy(null)
    if ("error" in result) {
      toast.error(result.error)
    } else {
      toast.success(
        `Load ${load.reference} marked complete. It shows as Completed until the POD comes in.`
      )
    }
  }

  async function openInvoice() {
    if (invoice) {
      router.push(`${invoicesBase}/${invoice.id}`)
      return
    }
    setBusy("invoice")
    const result = await createInvoice(organizationId, load.id)
    if ("error" in result) {
      setBusy(null)
      toast.error(result.error)
      return
    }
    router.push(`${invoicesBase}/${result.id}`)
  }

  async function move(to: LoadStatus) {
    setBusy(`status:${to}`)
    const result = await updateLoadStatus(organizationId, load.id, to)
    setBusy(null)
    if ("error" in result) {
      toast.error(result.error)
    } else {
      toast.success(
        `Load ${load.reference} marked ${LOAD_STATUS_LABELS[to].toLowerCase()}.`
      )
    }
  }

  const action = step.action
  const working = busy !== null

  return (
    <div className="flex flex-col gap-4">
      <input
        ref={fileRef}
        type="file"
        multiple
        accept={DOCUMENT_TYPES.join(",")}
        // A phone offers the camera for these.
        className="hidden"
        onChange={(event) => {
          void upload(event.currentTarget.files)
          event.currentTarget.value = ""
        }}
      />

      <AssignDialog
        open={assigning}
        onOpenChange={setAssigning}
        organizationId={organizationId}
        load={load}
        trucks={trucks}
        drivers={drivers}
        trucksBase={trucksBase}
        driversBase={driversBase}
        loadsBase={loadsBase}
      />

      {/* Next step */}
      <section className="overflow-hidden rounded-xl border bg-card text-card-foreground shadow-xs">
        <div className="px-5 pt-4 pb-5">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Next step
          </p>
          <h4 className="mt-1 text-lg font-semibold tracking-tight">
            {step.title}
          </h4>
          <p className="mt-1 text-sm text-muted-foreground">{step.detail}</p>
          {action && (
            <div className="mt-4 flex flex-col gap-2">
              {action.type === "assign" ? (
                <Button
                  size="lg"
                  className="w-full"
                  onClick={() => setAssigning(true)}
                >
                  Assign truck and driver <ArrowRight />
                </Button>
              ) : (
                <Button
                  size="lg"
                  className="w-full"
                  disabled={working}
                  onClick={() => {
                    if (action.type === "send") void send()
                    else if (action.type === "upload") pick(action.kind)
                    else if (action.type === "invoice") void openInvoice()
                    else void move(action.to)
                  }}
                >
                  {busy &&
                  (busy === "send" ||
                    busy === "invoice" ||
                    busy.startsWith("status:") ||
                    (action.type === "upload" &&
                      busy === `upload:${action.kind}`)) ? (
                    <Loader2 className="animate-spin" />
                  ) : action.type === "send" ? (
                    <Send />
                  ) : action.type === "upload" ? (
                    <Upload />
                  ) : action.type === "invoice" ? (
                    <ReceiptText />
                  ) : null}
                  {action.type === "send"
                    ? `Notify ${firstName(load.driver?.full_name)}`
                    : action.type === "upload"
                      ? `Upload ${DOCUMENT_LABELS[action.kind]}`
                      : action.label}
                </Button>
              )}
              {step.alternative && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={working}
                  onClick={() => {
                    const to = step.alternative!.to
                    void (to === "complete" ? complete() : move(to))
                  }}
                >
                  {step.alternative.label}
                </Button>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Documents */}
      <Panel
        title="Documents"
        aside={
          ready && (
            <span className="inline-flex h-6 items-center rounded-4xl bg-emerald-500/15 px-2.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
              Ready to invoice
            </span>
          )
        }
      >
        <ul className="flex flex-col divide-y">
          {shown.map((kind) => {
            const files = documents.filter((document) => document.kind === kind)
            const fromExpense =
              kind === "lumper_receipt" && files.length === 0
                ? lumperReceipt
                : undefined
            const done = files.length > 0 || !!fromExpense
            const uploading = busy === `upload:${kind}`
            return (
              <li key={kind} className="py-2.5 first:pt-0 last:pb-0">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex items-center gap-2">
                    {done ? (
                      <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <Circle className="size-4 text-muted-foreground" />
                    )}
                    <span
                      className={cn(
                        "font-medium",
                        !done && "text-muted-foreground"
                      )}
                    >
                      {DOCUMENT_LABELS[kind]}
                    </span>
                  </span>
                  <Button
                    variant={done ? "ghost" : "outline"}
                    size="xs"
                    disabled={working}
                    onClick={() => pick(kind)}
                    aria-label={`${done ? "Add another" : "Upload"} ${DOCUMENT_LABELS[kind]}`}
                  >
                    {uploading ? (
                      <Loader2 className="animate-spin" />
                    ) : done ? (
                      <Plus />
                    ) : (
                      <Upload />
                    )}
                    {done ? "Add" : "Upload"}
                  </Button>
                </div>
                {fromExpense?.receipt_url && (
                  <DocumentLink
                    file={{
                      url: fromExpense.receipt_url,
                      name: fromExpense.receipt_name ?? "Lumper receipt",
                      type: fromExpense.receipt_type ?? "image/webp",
                    }}
                    label="On the lumper expense"
                    className="mt-1.5 pl-6 text-sm"
                  />
                )}
                {files.length > 0 && (
                  <ul className="mt-1.5 flex flex-col gap-1 pl-6">
                    {files.map((file) => (
                      <li
                        key={file.id}
                        className="group flex items-center justify-between gap-2 text-sm"
                      >
                        {file.url ? (
                          <DocumentLink
                            file={{
                              url: file.url,
                              name: file.file_name,
                              type: file.content_type,
                            }}
                          />
                        ) : (
                          <span className="truncate text-muted-foreground">
                            {file.file_name}
                          </span>
                        )}
                        <button
                          type="button"
                          aria-label={`Remove ${file.file_name}`}
                          disabled={working}
                          onClick={() => void remove(file)}
                          className="rounded p-0.5 text-muted-foreground opacity-60 hover:bg-muted hover:text-foreground hover:opacity-100 disabled:opacity-30"
                        >
                          <X className="size-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            )
          })}
          <li className="flex items-center justify-between gap-3 py-2.5 text-sm last:pb-0">
            <span className="flex items-center gap-2">
              {invoiced ||
              invoice?.status === "sent" ||
              invoice?.status === "paid" ? (
                <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <Circle className="size-4 text-muted-foreground" />
              )}
              <span
                className={cn(
                  "font-medium",
                  !invoiced && "text-muted-foreground"
                )}
              >
                Invoice
              </span>
            </span>
            {invoice ? (
              <Link
                href={`${invoicesBase}/${invoice.id}`}
                className="text-xs font-medium hover:underline"
              >
                #{invoice.number} · {INVOICE_STATE_LABELS[invoice.status]}
              </Link>
            ) : (
              <span className="text-xs text-muted-foreground">
                {invoiced ? "Sent" : "Once the documents are in"}
              </span>
            )}
          </li>
        </ul>
      </Panel>

      {/* Money */}
      <Panel title="Money">
        <dl className="flex flex-col gap-2">
          <MoneyLine label="Revenue">{formatRate(revenue)}</MoneyLine>
          <MoneyLine
            label={locked ? `Driver pay (${locked})` : "Driver pay"}
            muted
          >
            {pay === null
              ? load.driver
                ? "Add miles or a rate"
                : "No driver yet"
              : `−${formatRate(pay)}`}
          </MoneyLine>
          {spent.map((line) => (
            <MoneyLine key={line.kind} label={EXPENSE_LABELS[line.kind]} muted>
              −{formatRate(line.total)}
            </MoneyLine>
          ))}
          <div className="my-1 border-t" />
          <MoneyLine label={spent.length ? "Profit" : "Margin"} strong>
            {pay === null ? "—" : formatRate(revenue - pay - expenseTotal)}
          </MoneyLine>
          <p className="text-xs text-muted-foreground">
            {spent.length
              ? "Before fixed costs like the truck payment and insurance."
              : "Before fuel and fixed costs. Add expenses as receipts come in."}
          </p>
          <p className="mt-1 text-sm text-muted-foreground tabular-nums">
            {load.miles ? (
              <>
                {formatRate(revenue / load.miles)} per estimated loaded mile
                {load.empty_miles ? (
                  <>
                    {" · "}
                    {formatRate(revenue / allMiles)} per mile all-in (with{" "}
                    {load.empty_miles.toLocaleString("en-US")} empty)
                  </>
                ) : null}
              </>
            ) : (
              "Add the miles to see the rate per mile."
            )}
          </p>
        </dl>
      </Panel>
    </div>
  )
}
