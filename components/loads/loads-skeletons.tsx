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
const FILTER_WIDTHS = [
  "w-14",
  "w-21",
  "w-28",
  "w-21",
  "w-25",
  "w-23",
  "w-16",
  "w-24",
  "w-25",
  "w-19",
]

const LOAD_ROWS = [
  { ref: "w-20", broker: "w-16", from: "w-36", to: "w-28", next: "w-30" },
  { ref: "w-24", broker: "w-24", from: "w-28", to: "w-32", next: "w-28" },
  { ref: "w-16", broker: "w-20", from: "w-32", to: "w-24", next: "w-28" },
  { ref: "w-20", broker: "w-28", from: "w-24", to: "w-36", next: "w-26" },
]

export function LoadsListSkeleton() {
  return (
    <div className="px-4 py-6 lg:px-6 lg:py-8">
      <div>
        <SettingsCard
          title="All loads"
          description="Search by load number or broker, or filter by status."
          action={<Skeleton className="h-8 w-26 rounded-md" />}
          contentClassName="@container px-0 pb-0"
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
                <TableHead className="w-full @4xl:w-px">Load</TableHead>
                <TableHead className="hidden w-full @4xl:table-cell">
                  Route
                </TableHead>
                <TableHead className="hidden w-px @2xl:table-cell">
                  Pickup
                </TableHead>
                <TableHead className="w-px text-right">Rate</TableHead>
                <TableHead className="w-px @max-xl:pr-6">Status</TableHead>
                <TableHead className="hidden w-px text-right @xl:table-cell">
                  Action
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {LOAD_ROWS.map((row, index) => (
                <TableRow key={index} className="hover:bg-transparent">
                  <TableCell className="py-3">
                    <Line className={row.ref} />
                    <Line className={cn("h-3.5", row.broker)} />
                  </TableCell>
                  <TableCell className="hidden @4xl:table-cell">
                    <div className="flex items-center gap-1.5">
                      <Skeleton className={cn("h-4", row.from)} />
                      <Skeleton className={cn("h-4", row.to)} />
                    </div>
                  </TableCell>
                  <TableCell className="hidden @2xl:table-cell">
                    <Skeleton className="h-4 w-12" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="ml-auto h-4 w-16" />
                  </TableCell>
                  <TableCell className="@max-xl:pr-6">
                    <Skeleton className="h-6 w-20 rounded-full" />
                  </TableCell>
                  <TableCell className="hidden @xl:table-cell">
                    <Skeleton
                      className={cn("ml-auto h-8 rounded-md", row.next)}
                    />
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
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        {/* The "All loads" link: a small ghost button. */}
        <Skeleton className="h-8 w-24 rounded-md" />
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_24rem]">
          <div className="flex min-w-0 flex-col gap-6">
            <SettingsCard
              title="Load"
              description="From the rate con."
              contentClassName="grid gap-5 sm:grid-cols-6"
            >
              <FieldSkeleton label="Load number" className="sm:col-span-6" />
              <FieldSkeleton
                label="Reference numbers"
                className="sm:col-span-6"
              />
              <FieldSkeleton label="Equipment" className="sm:col-span-2" />
              <FieldSkeleton label="Commodity" className="sm:col-span-2" />
              <FieldSkeleton label="Weight (lbs)" className="sm:col-span-2" />
              <FieldSkeleton label="Trailer number" className="sm:col-span-2" />
              <FieldSkeleton
                label="Notes"
                className="sm:col-span-6"
                inputClassName="h-20"
              />
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
                </div>
                <div className="grid gap-5 sm:grid-cols-2">
                  <FieldSkeleton label="Detention free hours" />
                  <FieldSkeleton label="Detention per hour" />
                </div>
              </div>
            </SettingsCard>
            <SettingsCard
              title="Assignment"
              description="Truck and driver can stay empty until the load is dispatched."
              contentClassName="grid gap-5 sm:grid-cols-2"
            >
              <FieldSkeleton label="Truck" />
              <FieldSkeleton label="Driver" />
              <FieldSkeleton label="Loaded miles" />
              <FieldSkeleton label="Empty miles" />
            </SettingsCard>
          </div>
          <div className="flex flex-col gap-6">
            <section className="overflow-hidden rounded-xl border bg-card px-5 pt-4 pb-5 shadow-xs">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                New load
              </p>
              <p className="mt-1 text-lg font-semibold tracking-tight">
                Start with the rate con
              </p>
              <Line className="mt-1 w-full" />
              {/* The drop area, then Save. */}
              <Skeleton className="mt-4 h-28 w-full rounded-lg" />
              <Skeleton className="mt-4 h-10 w-full rounded-md bg-foreground/10" />
            </section>
            {["Documents", "Money"].map((title) => (
              <section
                key={title}
                className="overflow-hidden rounded-xl border bg-card px-5 py-4 shadow-xs"
              >
                <p className="mb-3 font-semibold">{title}</p>
                <div className="flex flex-col gap-2">
                  <Line className="w-full" />
                  <Line className="w-full" />
                  <Line className="w-2/3" />
                </div>
              </section>
            ))}
          </div>
        </div>
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
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        {/* The "All loads" link: a small ghost button. */}
        <Skeleton className="h-8 w-24 rounded-md" />
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_24rem]">
          <div className="flex min-w-0 flex-col gap-6">
            <SettingsCard
              title="Load"
              description={
                <span className="inline-block h-4 w-32 animate-pulse rounded-md bg-muted align-middle" />
              }
              action={<Skeleton className="h-6 w-20 rounded-full" />}
            >
              <div className="grid gap-5 sm:grid-cols-3">
                <div className="sm:col-span-3">
                  <DetailSkeleton label="Reference numbers" lines={["w-40"]} />
                </div>
                <DetailSkeleton label="Equipment" lines={["w-16"]} />
                <DetailSkeleton label="Commodity" lines={["w-24"]} />
                <DetailSkeleton label="Weight" lines={["w-20"]} />
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
              title="Stops"
              description={
                // The description is a <p>, so an inline placeholder.
                <span className="inline-block h-4 w-44 animate-pulse rounded-md bg-muted align-middle" />
              }
              contentClassName="flex flex-col gap-4"
            >
              {[0, 1].map((index) => (
                <div key={index} className="flex items-start gap-3">
                  <Skeleton className="size-7 shrink-0 rounded-full" />
                  <div className="flex-1">
                    <Line className="w-32" />
                    <Line className="w-64" />
                    <Line className="h-3.5 w-40" />
                  </div>
                </div>
              ))}
            </SettingsCard>
            <SettingsCard
              title="Charges"
              description={
                <span className="inline-block h-4 w-52 animate-pulse rounded-md bg-muted align-middle" />
              }
              contentClassName="flex flex-col gap-2"
            >
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-5 w-2/3" />
            </SettingsCard>
            <SettingsCard
              title="Assignment"
              description={
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
              <FieldSkeleton label="Loaded miles" />
              <FieldSkeleton label="Empty miles" />
            </SettingsCard>
            <SettingsCard
              title="Expenses"
              description="Fuel, tolls, lumper and other costs on this trip."
              contentClassName="flex flex-col gap-2"
            >
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-5 w-2/3" />
            </SettingsCard>
          </div>
          <div className="flex flex-col gap-6 lg:row-span-2">
            {[
              ["Next step", ["w-48", "w-full", "w-3/4"]],
              ["Documents", ["w-full", "w-full", "w-full", "w-full"]],
              ["Money", ["w-full", "w-full", "w-full"]],
            ].map(([title, lines]) => (
              <section
                key={title as string}
                className="overflow-hidden rounded-xl border bg-card px-5 py-4 shadow-xs"
              >
                <p className="mb-3 font-semibold">{title as string}</p>
                <div className="flex flex-col gap-2">
                  {(lines as string[]).map((width, index) => (
                    <Line key={index} className={width} />
                  ))}
                </div>
              </section>
            ))}
          </div>
          <div className="min-w-0">
            <div className="flex items-center justify-between rounded-xl border bg-card px-5 py-4 shadow-xs">
              <span className="font-semibold">History</span>
              <Line className="w-20" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
