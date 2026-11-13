import { cn } from "cn"

import {
  SettingsCard,
  SettingsCardFooter,
} from "@/components/settings/settings-card"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

/*
 * Loading states for the Loads pages. As in the settings skeletons, text that
 * doesn't depend on data is real and built from the same pieces as the pages,
 * so nothing shifts when the content arrives. Only values are placeholders.
 * Keep the page wrappers in step with the pages.
 */

/** A placeholder sized to the 20px line of text it stands in for. */
function Line({ className }: { className?: string }) {
  return (
    <div className="flex h-5 items-center">
      <Skeleton className={cn("h-4", className)} />
    </div>
  )
}

// All, Booked, In transit, Delivered, Invoiced, Cancelled.
const FILTER_WIDTHS = ["w-14", "w-20", "w-24", "w-24", "w-22", "w-24"]

const LOAD_ROWS = [
  { ref: "w-20", broker: "w-16", from: "w-36", to: "w-28" },
  { ref: "w-24", broker: "w-24", from: "w-28", to: "w-32" },
  { ref: "w-16", broker: "w-20", from: "w-32", to: "w-24" },
  { ref: "w-20", broker: "w-28", from: "w-24", to: "w-36" },
]

export function LoadsListSkeleton() {
  return (
    <div className="px-4 py-6 lg:px-6 lg:py-8">
      <div>
        <SettingsCard
          title="All loads"
          description="Search by load number or broker, or filter by status."
          action={<Skeleton className="h-8 w-26 rounded-md" />}
          contentClassName="px-0 pb-0"
          footer={
            <SettingsCardFooter
              hint={<Skeleton className="h-4 w-16 bg-foreground/10" />}
            />
          }
        >
          <div className="flex flex-col gap-3 px-6 pb-4">
            <Skeleton className="h-9 w-full" />
            <div className="flex flex-wrap gap-1">
              {FILTER_WIDTHS.map((width, index) => (
                <Skeleton key={index} className={cn("h-8 rounded-md", width)} />
              ))}
            </div>
          </div>
          <Table className="[&_td:first-child]:pl-6 [&_td:last-child]:pr-6 [&_th:first-child]:pl-6 [&_th:last-child]:pr-6">
            <TableHeader className="bg-muted/40">
              <TableRow>
                <TableHead>Load</TableHead>
                <TableHead className="hidden md:table-cell">Route</TableHead>
                <TableHead className="hidden sm:table-cell">Pickup</TableHead>
                <TableHead className="text-right">Rate</TableHead>
                <TableHead className="w-32">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {LOAD_ROWS.map((row, index) => (
                <TableRow key={index} className="hover:bg-transparent">
                  <TableCell className="py-3">
                    <Line className={row.ref} />
                    <Line className={cn("h-3.5", row.broker)} />
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <div className="flex items-center gap-1.5">
                      <Skeleton className={cn("h-4", row.from)} />
                      <Skeleton className={cn("h-4", row.to)} />
                    </div>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <Skeleton className="h-4 w-12" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="ml-auto h-4 w-16" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-6 w-20 rounded-full" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </SettingsCard>
      </div>
    </div>
  )
}

function FieldSkeleton({
  label,
  hint,
  className,
  inputClassName,
}: {
  label: string
  hint?: string
  className?: string
  inputClassName?: string
}) {
  return (
    <Field className={className}>
      <FieldLabel>{label}</FieldLabel>
      <Skeleton className={cn("h-9 w-full", inputClassName)} />
      {hint && <FieldDescription>{hint}</FieldDescription>}
    </Field>
  )
}

/** A date button and a time input, side by side. */
function DateTimeSkeleton({
  label,
  hint,
  className,
}: {
  label: string
  hint: string
  className?: string
}) {
  return (
    <Field className={className}>
      <FieldLabel>{label}</FieldLabel>
      <div className="flex gap-2">
        <Skeleton className="h-9 flex-1" />
        <Skeleton className="h-9 w-32 shrink-0" />
      </div>
      <FieldDescription>{hint}</FieldDescription>
    </Field>
  )
}

/** One stop in the stops editor: a numbered header and its fields. */
function StopRowSkeleton({
  number,
  kind,
}: {
  number: number
  kind: "pickup" | "delivery"
}) {
  return (
    <li className="flex flex-col gap-4 rounded-lg border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "flex size-7 items-center justify-center rounded-full text-xs font-semibold",
              kind === "pickup"
                ? "bg-sky-500/10 text-sky-700 dark:text-sky-300"
                : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
            )}
          >
            {number}
          </span>
          <Skeleton className="h-8 w-32 rounded-md" />
        </div>
        {/* Move up, move down, remove. */}
        <div className="flex items-center gap-1">
          <Skeleton className="size-8 rounded-md" />
          <Skeleton className="size-8 rounded-md" />
          <Skeleton className="size-8 rounded-md" />
        </div>
      </div>
      <div className="grid gap-5 sm:grid-cols-6">
        <FieldSkeleton label="Address" className="sm:col-span-4" />
        <FieldSkeleton
          label={kind === "pickup" ? "Pickup number" : "Delivery number"}
          className="sm:col-span-2"
        />
        <DateTimeSkeleton
          label="Appointment"
          hint="Local time at the stop."
          className="sm:col-span-3"
        />
        <DateTimeSkeleton
          label="Window ends (optional)"
          hint="Leave blank for a set appointment."
          className="sm:col-span-3"
        />
      </div>
    </li>
  )
}

/** One charge field; only the first row shows the column labels. */
function ChargeCellSkeleton({
  label,
  showLabel,
  className,
}: {
  label: string
  showLabel: boolean
  className: string
}) {
  return (
    <Field className={className}>
      {showLabel && <FieldLabel>{label}</FieldLabel>}
      <Skeleton className="h-9 w-full" />
    </Field>
  )
}

/** One charge line; the first row carries the column labels. */
function ChargeRowSkeleton({ labels = false }: { labels?: boolean }) {
  return (
    <div className="grid gap-3 sm:grid-cols-12">
      <ChargeCellSkeleton
        label="Charge"
        showLabel={labels}
        className="sm:col-span-3"
      />
      <ChargeCellSkeleton
        label="Note"
        showLabel={labels}
        className="sm:col-span-5"
      />
      <ChargeCellSkeleton
        label="Amount"
        showLabel={labels}
        className="sm:col-span-3"
      />
      <div
        className={
          labels ? "flex items-end sm:col-span-1" : "flex sm:col-span-1"
        }
      >
        <Skeleton className="size-9 rounded-md" />
      </div>
    </div>
  )
}

export function NewLoadSkeleton() {
  return (
    <div className="px-4 py-6 lg:px-6 lg:py-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <SettingsCard
          title="Load"
          description="Typed in from the rate con. Reading it from a photo, PDF or email is coming next."
          contentClassName="grid gap-5 sm:grid-cols-6"
        >
          <FieldSkeleton label="Load number" className="sm:col-span-6" />
          <FieldSkeleton
            label="Reference numbers"
            hint="PO, order or other numbers the shipper or receiver goes by."
            className="sm:col-span-6"
          />
          <FieldSkeleton label="Equipment" className="sm:col-span-2" />
          <FieldSkeleton label="Commodity" className="sm:col-span-2" />
          <FieldSkeleton label="Weight (lbs)" className="sm:col-span-2" />
          <FieldSkeleton label="Trailer number" className="sm:col-span-2" />
        </SettingsCard>
        <SettingsCard
          title="Broker"
          description="Who booked it, and who sent the rate con."
          contentClassName="grid gap-5 sm:grid-cols-6"
        >
          <FieldSkeleton label="Broker" className="sm:col-span-3" />
          <FieldSkeleton label="Rate con from" className="sm:col-span-3" />
        </SettingsCard>
        <SettingsCard
          title="Stops"
          description="Every pickup and delivery, with its appointment and number."
        >
          <div className="flex flex-col gap-4">
            <ol className="flex flex-col gap-4">
              <StopRowSkeleton number={1} kind="pickup" />
              <StopRowSkeleton number={2} kind="delivery" />
            </ol>
            {/* Add pickup, add delivery. */}
            <div className="flex flex-wrap items-center gap-2">
              <Skeleton className="h-8 w-28 rounded-md" />
              <Skeleton className="h-8 w-32 rounded-md" />
            </div>
            <FieldDescription>
              In the order they&apos;re run: start with a pickup, end with a
              delivery.
            </FieldDescription>
          </div>
        </SettingsCard>
        <SettingsCard
          title="Charges"
          description="From the rate con. Accessorials run up on the road are added to the load later."
        >
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-3">
              <ChargeRowSkeleton labels />
              <ChargeRowSkeleton />
              <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
                <Skeleton className="h-8 w-24 rounded-md" />
                <p className="text-sm">
                  <span className="text-muted-foreground">Total </span>
                  <span className="inline-block h-4 w-14 animate-pulse rounded-md bg-muted align-middle" />
                </p>
              </div>
              <FieldDescription>
                Linehaul and fuel surcharge on their own lines. Blank lines are
                skipped.
              </FieldDescription>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <FieldSkeleton
                label="Detention free hours"
                hint="At each stop, from the rate con."
              />
              <FieldSkeleton
                label="Detention per hour"
                hint="After the free hours run out."
              />
            </div>
          </div>
        </SettingsCard>
        <SettingsCard
          title="Assignment"
          description="Truck and driver can stay empty until the load is dispatched."
          contentClassName="grid gap-5 sm:grid-cols-2"
          footer={
            <SettingsCardFooter hint="New loads start as booked.">
              <Skeleton className="h-8 w-16 rounded-md bg-foreground/10" />
              <Skeleton className="h-8 w-24 rounded-md bg-foreground/10" />
            </SettingsCardFooter>
          }
        >
          <FieldSkeleton label="Truck" />
          <FieldSkeleton
            label="Driver"
            hint="Filled in from the truck's default driver."
          />
          <FieldSkeleton
            label="Loaded miles"
            hint="Pickup to delivery. Used for per-mile pay."
          />
          <FieldSkeleton
            label="Empty miles"
            hint="Deadhead to the pickup. Counts toward cost per mile."
          />
          <FieldSkeleton
            label="Notes"
            className="sm:col-span-2"
            inputClassName="h-20"
          />
        </SettingsCard>
      </div>
    </div>
  )
}

function DetailSkeleton({
  label,
  className,
  lines = ["w-24"],
}: {
  label: string
  className?: string
  lines?: string[]
}) {
  return (
    <div className={cn("space-y-1", className)}>
      <div className="text-sm text-muted-foreground">{label}</div>
      <div>
        {lines.map((width, index) => (
          <Line key={index} className={width} />
        ))}
      </div>
    </div>
  )
}

export function LoadDetailSkeleton() {
  return (
    <div className="px-4 py-6 lg:px-6 lg:py-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-4">
        {/* The "All loads" link: a small ghost button. */}
        <Skeleton className="h-8 w-24 rounded-md" />
        <section className="overflow-hidden rounded-xl border bg-card shadow-xs">
          <div className="flex items-start justify-between gap-4 px-6 pt-5">
            <div className="space-y-1">
              <div className="flex h-6 items-center">
                <Skeleton className="h-4 w-32" />
              </div>
              <Line className="h-3.5 w-20" />
            </div>
            <Skeleton className="h-6 w-20 rounded-full" />
          </div>
          <div className="grid gap-5 px-6 pt-5 pb-6 sm:grid-cols-2">
            <DetailSkeleton label="Pickup" lines={["w-48", "w-56"]} />
            <DetailSkeleton label="Delivery" lines={["w-36", "w-56"]} />
          </div>
        </section>
        <SettingsCard title="Details">
          <div className="grid gap-5 sm:grid-cols-3">
            <DetailSkeleton label="Rate" lines={["w-20"]} />
            <DetailSkeleton label="Rate per mile" lines={["w-24"]} />
            <DetailSkeleton label="Empty miles" lines={["w-16"]} />
            <DetailSkeleton
              label="Notes"
              className="sm:col-span-3"
              lines={["w-64"]}
            />
          </div>
        </SettingsCard>
        <SettingsCard
          title="Broker"
          description="Who booked it, and who sent the rate con."
          contentClassName="grid gap-5 sm:grid-cols-6"
          footer={
            <SettingsCardFooter hint="Linking a broker re-checks them with FMCSA.">
              <Skeleton className="h-8 w-16 rounded-md bg-foreground/10" />
            </SettingsCardFooter>
          }
        >
          <FieldSkeleton label="Broker" className="sm:col-span-3" />
          <FieldSkeleton label="Rate con from" className="sm:col-span-3" />
        </SettingsCard>
        <SettingsCard
          title="Truck, driver and miles"
          description={
            // The description is a <p>, so an inline placeholder.
            <span className="inline-block h-4 w-48 animate-pulse rounded-md bg-muted align-middle" />
          }
          contentClassName="grid gap-5 sm:grid-cols-2"
          footer={
            <SettingsCardFooter
              hint={<Skeleton className="h-4 w-56 bg-foreground/10" />}
            >
              <Skeleton className="h-8 w-16 rounded-md bg-foreground/10" />
            </SettingsCardFooter>
          }
        >
          <FieldSkeleton label="Truck" />
          <FieldSkeleton label="Driver" />
          <FieldSkeleton
            label="Loaded miles"
            hint="Pickup to delivery. Used for per-mile pay."
          />
          <FieldSkeleton
            label="Empty miles"
            hint="Deadhead to the pickup. Counts toward cost per mile."
          />
        </SettingsCard>
      </div>
    </div>
  )
}
