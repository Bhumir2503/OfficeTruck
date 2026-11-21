"use client"

import { cn } from "cn"
import {
  ChevronLeft,
  ChevronRight,
  FileText,
  ImageIcon,
  Paperclip,
  Plus,
  Printer,
  Trash2,
  Upload,
  Wrench,
} from "lucide-react"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import {
  addTruckMaintenance,
  removeTruckMaintenance,
} from "@/app/org/[slug]/equipment/actions"
import {
  addTrailerMaintenance,
  removeTrailerMaintenance,
} from "@/app/org/[slug]/trailers/actions"
import {
  SettingsCard,
  SettingsCardFooter,
  SettingsEmptyState,
} from "@/components/settings/settings-card"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { FILE_TYPES, driverFileError } from "@/lib/driver-document-upload"
import { formatDate } from "@/lib/driver-format"
import { formatRate } from "@/lib/load-format"
import {
  MAINTENANCE_KINDS,
  MAINTENANCE_LABELS,
  maintenanceSchema,
  type MaintenanceKind,
} from "@/lib/schemas/truck"
import { removeTruckFile, uploadTruckFile } from "@/lib/truck-document-upload"
import type { PmStatus } from "@/lib/truck-format"
import type { TruckMaintenance as Entry } from "@/lib/trucks"

const miles = new Intl.NumberFormat("en-US")

/** Entries shown at a time in the log. */
const PAGE_SIZE = 5

/** "1–5 of 12", or "6 of 6" when a page has one entry. */
const range = (first: number, last: number, total: number) =>
  `${first === last ? first : `${first}–${last}`} of ${total}`

/** One line on when the next preventive service is due. */
function pmLine(pm: PmStatus) {
  switch (pm.state) {
    case "unscheduled":
      return "No service interval set. Add one on the Maintenance schedule card."
    case "no_history":
      return "Log a preventive service to start the countdown."
    default: {
      const parts = [
        pm.dueOn && formatDate(pm.dueOn),
        pm.dueAtMiles !== null && `${miles.format(pm.dueAtMiles)} mi`,
      ].filter(Boolean)
      const left =
        pm.milesLeft !== null
          ? pm.milesLeft <= 0
            ? ` · ${miles.format(-pm.milesLeft)} mi over`
            : ` · ${miles.format(pm.milesLeft)} mi to go`
          : ""
      return `${pm.state === "due" ? "Overdue" : "Next service"}: ${parts.join(" or ")}${left}`
    }
  }
}

/** Which vehicle the log is for, which decides where entries are saved. */
type Vehicle = "truck" | "trailer"

const ACTIONS = {
  truck: { add: addTruckMaintenance, remove: removeTruckMaintenance },
  trailer: { add: addTrailerMaintenance, remove: removeTrailerMaintenance },
}

function AddEntryDialog({
  organizationId,
  vehicle,
  truckId,
  today,
  open,
  onOpenChange,
}: {
  organizationId: string
  vehicle: Vehicle
  /** The truck's or trailer's id. */
  truckId: string
  /** "YYYY-MM-DD" */
  today: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [kind, setKind] = useState<MaintenanceKind>("preventive")
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const [receipt, setReceipt] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)

  function pickReceipt(file: File | null | undefined) {
    if (!file) return
    const problem = driverFileError(file)
    if (problem) {
      setError(problem)
      return
    }
    setError(null)
    setReceipt(file)
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Log maintenance</DialogTitle>
          <DialogDescription>
            A service, repair or inspection on this {vehicle}. An inspection
            also counts as its last annual inspection.
          </DialogDescription>
        </DialogHeader>
        <form
          id="truck-maintenance-form"
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault()
            const data = Object.fromEntries(new FormData(event.currentTarget))
            const parsed = maintenanceSchema.safeParse({ ...data, kind })
            if (!parsed.success) {
              setError(parsed.error.issues[0]?.message ?? "Check the entry.")
              return
            }
            start(async () => {
              // Upload the receipt first, so the entry points at a real file.
              let uploaded = null
              if (receipt) {
                const result = await uploadTruckFile(
                  organizationId,
                  truckId,
                  "receipt",
                  receipt
                )
                if ("error" in result) {
                  setError(result.error)
                  return
                }
                uploaded = result
              }
              const result = await ACTIONS[vehicle].add(
                organizationId,
                truckId,
                parsed.data,
                uploaded
              )
              if ("error" in result) {
                if (uploaded) await removeTruckFile(uploaded.path)
                setError(result.error)
                return
              }
              toast.success(`${MAINTENANCE_LABELS[kind]} logged.`)
              onOpenChange(false)
            })
          }}
        >
          <Field>
            <FieldLabel htmlFor="maintenance-done-on">Date</FieldLabel>
            <Input
              id="maintenance-done-on"
              name="done_on"
              type="date"
              max={today}
              defaultValue={today}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="maintenance-kind">Type</FieldLabel>
            <Select
              value={kind}
              onValueChange={(value) =>
                setKind((value as MaintenanceKind | null) ?? "preventive")
              }
              items={MAINTENANCE_KINDS.map((value) => ({
                value,
                label: MAINTENANCE_LABELS[value],
              }))}
            >
              <SelectTrigger id="maintenance-kind" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MAINTENANCE_KINDS.map((value) => (
                  <SelectItem key={value} value={value}>
                    {MAINTENANCE_LABELS[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field className="sm:col-span-2">
            <FieldLabel htmlFor="maintenance-description">
              What was done
            </FieldLabel>
            <Input
              id="maintenance-description"
              name="description"
              maxLength={500}
              placeholder="e.g. Oil and filters, greased chassis"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="maintenance-odometer">Odometer</FieldLabel>
            <Input
              id="maintenance-odometer"
              name="odometer"
              inputMode="numeric"
              placeholder="Miles"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="maintenance-cost">Cost</FieldLabel>
            <Input
              id="maintenance-cost"
              name="cost"
              inputMode="decimal"
              placeholder="$0.00"
            />
          </Field>
          <Field className="sm:col-span-2">
            <FieldLabel htmlFor="maintenance-vendor">Shop</FieldLabel>
            <Input
              id="maintenance-vendor"
              name="vendor"
              maxLength={120}
              placeholder="e.g. Rush Truck Center, Dallas"
            />
          </Field>
          {/* A drop zone that's also the file picker. No name: it's
              uploaded on its own, not sent with the entry's fields. */}
          <Field className="sm:col-span-2">
            <FieldLabel htmlFor="maintenance-receipt">
              Receipt (optional)
            </FieldLabel>
            <label
              htmlFor="maintenance-receipt"
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-lg border border-dashed px-4 py-3 transition-colors hover:bg-muted/50",
                dragging && "border-primary bg-muted/50"
              )}
              onDragOver={(event) => {
                event.preventDefault()
                setDragging(true)
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault()
                setDragging(false)
                pickReceipt(event.dataTransfer.files[0])
              }}
            >
              <input
                id="maintenance-receipt"
                type="file"
                className="sr-only"
                accept={FILE_TYPES.join(",")}
                onChange={(event) => pickReceipt(event.target.files?.[0])}
              />
              {receipt ? (
                <>
                  {receipt.type === "application/pdf" ? (
                    <FileText className="size-5 shrink-0 text-muted-foreground" />
                  ) : (
                    <ImageIcon className="size-5 shrink-0 text-muted-foreground" />
                  )}
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {receipt.name}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    Change
                  </span>
                </>
              ) : (
                <>
                  <Upload className="size-5 shrink-0 text-muted-foreground" />
                  <span className="text-sm">
                    Drop the receipt or invoice here, or click to choose
                  </span>
                </>
              )}
            </label>
          </Field>
          {error && (
            <p role="alert" className="text-sm text-destructive sm:col-span-2">
              {error}
            </p>
          )}
        </form>
        <DialogFooter>
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="truck-maintenance-form"
            disabled={pending}
          >
            {pending ? "Saving…" : "Save entry"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * A truck's or trailer's maintenance log, kept for every vehicle as FMCSA
 * asks, with when a truck's next preventive service is due.
 */
export function TruckMaintenance({
  organizationId,
  vehicle = "truck",
  truckId,
  entries,
  pm,
  odometerNote,
  printHref,
  canManage,
  today,
}: {
  organizationId: string
  vehicle?: Vehicle
  /** The truck's or trailer's id. */
  truckId: string
  entries: Entry[]
  /** A truck's service schedule; trailers have none here. */
  pm?: PmStatus | null
  /** How the odometer behind the reminder was estimated, if it was. */
  odometerNote?: string | null
  /** The printable record of the whole log, for audits. */
  printHref?: string
  canManage: boolean
  /** "YYYY-MM-DD" */
  today: string
}) {
  const [adding, setAdding] = useState(false)
  // A fresh form each time it opens.
  const [dialogKey, setDialogKey] = useState(0)
  const [deleting, setDeleting] = useState<Entry | null>(null)
  const [pending, start] = useTransition()
  // Five entries a page, newest first. Deleting the last entry on a page
  // steps back to the page before.
  const [page, setPage] = useState(0)
  const pages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE))
  const current = Math.min(page, pages - 1)
  const shown = entries.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE)

  function remove() {
    if (!deleting) return
    const entry = deleting
    start(async () => {
      const result = await ACTIONS[vehicle].remove(
        organizationId,
        truckId,
        entry.id
      )
      if ("error" in result) {
        toast.error(result.error)
        return
      }
      toast.success("Entry deleted.")
      setDeleting(null)
    })
  }

  return (
    <SettingsCard
      // Columns appear as the card gets wider, not the window.
      className="@container"
      title="Maintenance"
      description={
        <span
          className={cn(
            pm?.state === "due" && "text-destructive",
            pm?.state === "soon" && "text-amber-700 dark:text-amber-300"
          )}
        >
          {pm
            ? pmLine(pm)
            : "Every service, repair and inspection on this trailer."}
          {odometerNote && (
            <span className="block text-muted-foreground">{odometerNote}</span>
          )}
        </span>
      }
      action={
        <div className="flex shrink-0 gap-2">
          {printHref && entries.length > 0 && (
            <a
              href={printHref}
              target="_blank"
              rel="noreferrer"
              className={buttonVariants({ variant: "ghost", size: "sm" })}
            >
              <Printer />
              Print log
            </a>
          )}
          {canManage && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setDialogKey((key) => key + 1)
                setAdding(true)
              }}
            >
              <Plus />
              Log maintenance
            </Button>
          )}
        </div>
      }
      contentClassName={entries.length ? "px-0 pb-0" : undefined}
      // The page footer shows whenever there's an entry; with one page its
      // buttons are just disabled.
      footer={
        entries.length > 0 && (
          <SettingsCardFooter
            hint={range(
              current * PAGE_SIZE + 1,
              current * PAGE_SIZE + shown.length,
              entries.length
            )}
          >
            <Button
              variant="outline"
              size="sm"
              disabled={current === 0}
              onClick={() => setPage(current - 1)}
            >
              <ChevronLeft />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={current === pages - 1}
              onClick={() => setPage(current + 1)}
            >
              Next
              <ChevronRight />
            </Button>
          </SettingsCardFooter>
        )
      }
    >
      {entries.length === 0 ? (
        <SettingsEmptyState icon={Wrench} title="Nothing logged yet">
          {canManage
            ? "Log each service, repair and inspection. Keep the record for as long as you have the truck, and 6 months after."
            : "Owners and admins log maintenance here."}
        </SettingsEmptyState>
      ) : (
        <Table className="[&_td:first-child]:pl-6 [&_td:last-child]:pr-6 [&_th:first-child]:pl-6 [&_th:last-child]:pr-6">
          <TableHeader className="bg-muted/40">
            <TableRow>
              {/* Work takes the spare width; the rest fit their contents. */}
              <TableHead className="w-px">Date</TableHead>
              <TableHead className="w-full">Work</TableHead>
              <TableHead className="hidden w-px text-right @lg:table-cell">
                Odometer
              </TableHead>
              <TableHead className="hidden w-px text-right @md:table-cell">
                Cost
              </TableHead>
              <TableHead className="w-px">
                <span className="sr-only">Receipt and actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell className="text-sm whitespace-nowrap tabular-nums">
                  {formatDate(entry.done_on)}
                </TableCell>
                <TableCell className="max-w-0 py-3">
                  <div className="truncate text-sm font-medium">
                    {entry.description}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {[MAINTENANCE_LABELS[entry.kind], entry.vendor]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                </TableCell>
                <TableCell className="hidden text-right text-sm whitespace-nowrap text-muted-foreground tabular-nums @lg:table-cell">
                  {entry.odometer === null
                    ? "—"
                    : `${miles.format(entry.odometer)} mi`}
                </TableCell>
                <TableCell className="hidden text-right text-sm whitespace-nowrap tabular-nums @md:table-cell">
                  {entry.cost === null ? "—" : formatRate(entry.cost)}
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    {entry.receipt?.url && (
                      <a
                        href={entry.receipt.url}
                        target="_blank"
                        rel="noreferrer"
                        title={entry.receipt.name}
                        aria-label={`Open the receipt, ${entry.receipt.name}`}
                        className={buttonVariants({
                          variant: "ghost",
                          size: "icon-sm",
                        })}
                      >
                        <Paperclip />
                      </a>
                    )}
                    {canManage && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="hover:text-destructive"
                        aria-label={`Delete ${entry.description}`}
                        disabled={pending}
                        onClick={() => setDeleting(entry)}
                      >
                        <Trash2 />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {canManage && (
        <AddEntryDialog
          key={dialogKey}
          organizationId={organizationId}
          vehicle={vehicle}
          truckId={truckId}
          today={today}
          open={adding}
          onOpenChange={setAdding}
        />
      )}
      <Dialog
        open={deleting !== null}
        onOpenChange={(open) => !pending && !open && setDeleting(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete this entry?</DialogTitle>
            <DialogDescription>
              {deleting
                ? `${deleting.description} on ${formatDate(deleting.done_on)}${deleting.receipt ? ", and its receipt," : ""} will be deleted. This can't be undone.`
                : "This can't be undone."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => setDeleting(null)}
            >
              Cancel
            </Button>
            <Button variant="destructive" disabled={pending} onClick={remove}>
              {pending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingsCard>
  )
}
