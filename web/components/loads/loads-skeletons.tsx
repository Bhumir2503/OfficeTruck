import { cn } from "cn"
import { ArrowLeft } from "lucide-react"

import {
  SettingsCard,
  SettingsCardFooter,
} from "@/components/settings/settings-card"
import { buttonVariants } from "@/components/ui/button"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import {
  LOAD_TAB_LABELS,
  LOAD_TABS,
  type LoadTab,
} from "@/components/loads/load-tabs"
import { MoneyLine, Panel } from "@/components/side-panel"
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

/**
 * A placeholder sized to the 20px line of text it stands in for. `className`
 * sizes the bar; `spacing` sets margins on the line itself, like mt-1.
 */
function Line({
  className,
  spacing,
}: {
  className?: string
  spacing?: string
}) {
  return (
    <div className={cn("flex h-5 items-center", spacing)}>
      <Skeleton className={cn("h-4", className)} />
    </div>
  )
}

/** The "All loads" link back to the list, as the pages show it. */
function BackLinkSkeleton() {
  return (
    <span
      className={buttonVariants({
        variant: "ghost",
        size: "sm",
        className: "pointer-events-none -ml-2 w-fit",
      })}
    >
      <ArrowLeft />
      All loads
    </span>
  )
}

// All, Booked, Dispatched, In transit, Delivered, Invoiced, Paid, Factored,
// Cancelled, TONU.
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
  {
    ref: "w-20",
    broker: "w-16",
    from: "w-36",
    to: "w-28",
    driver: "w-24",
    next: "w-30",
  },
  {
    ref: "w-24",
    broker: "w-24",
    from: "w-28",
    to: "w-32",
    driver: "w-20",
    next: "w-28",
  },
  {
    ref: "w-16",
    broker: "w-20",
    from: "w-32",
    to: "w-24",
    driver: "w-24",
    next: "w-28",
  },
  {
    ref: "w-20",
    broker: "w-28",
    from: "w-24",
    to: "w-36",
    driver: "w-16",
    next: "w-26",
  },
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
                <TableHead className="hidden w-px @4xl:table-cell">
                  Driver
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
                  <TableCell className="hidden @4xl:table-cell">
                    <Skeleton className={cn("h-4", row.driver)} />
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
      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-9 min-w-40 flex-1" />
        <Skeleton className="h-9 w-28" />
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
    <li className="overflow-hidden rounded-xl border bg-card">
      <div className="flex items-center justify-between gap-2 border-b bg-muted/30 px-4 py-2">
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
          <Skeleton className="h-8 w-28 rounded-md" />
        </div>
        {/* Move up, move down, remove. */}
        <div className="flex items-center">
          <Skeleton className="size-8 rounded-md" />
          <Skeleton className="size-8 rounded-md" />
          <Skeleton className="size-8 rounded-md" />
        </div>
      </div>
      <div className="grid gap-5 p-4 sm:grid-cols-6">
        <FieldSkeleton
          label={kind === "pickup" ? "Shipper" : "Receiver"}
          className="sm:col-span-4"
        />
        <FieldSkeleton
          label={kind === "pickup" ? "Pickup #" : "Delivery #"}
          className="sm:col-span-2"
        />
        <FieldSkeleton label="Address" className="sm:col-span-6" />
        <div className="flex flex-col gap-3 sm:col-span-6">
          {/* Appointment, window or to be scheduled. */}
          <Skeleton className="h-8 w-full rounded-md" />
          <DateTimeSkeleton
            label="Appointment"
            hint="A set appointment time, local to the stop."
            className="sm:w-1/2"
          />
        </div>
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
        <BackLinkSkeleton />
        <div className="grid items-start gap-6 @4xl/main:grid-cols-[minmax(0,1fr)_20rem] @6xl/main:grid-cols-[minmax(0,1fr)_24rem]">
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
              title="Customer"
              description="Who booked it, and who sent the rate con."
              contentClassName="grid gap-5 sm:grid-cols-6"
            >
              <FieldSkeleton label="Customer" className="sm:col-span-3" />
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
              <FieldSkeleton label="Estimated loaded miles" />
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
              <Line spacing="mt-1" className="w-full" />
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
  width = "w-24",
}: {
  label: string
  className?: string
  width?: string
}) {
  return (
    <div className={className}>
      <div className="text-sm text-muted-foreground">{label}</div>
      <Line spacing="mt-1" className={width} />
    </div>
  )
}

/** A small outline button, like Edit or Upload. */
function ButtonSkeleton({ className }: { className?: string }) {
  return <Skeleton className={cn("h-8 shrink-0 rounded-md", className)} />
}

/** The load card at the top: number, broker, status and what's hauled. */
function LoadDetailsCardSkeleton() {
  return (
    <SettingsCard
      title="Load"
      description={
        <span className="inline-block h-4 w-32 animate-pulse rounded-md bg-muted align-middle" />
      }
      action={
        <div className="flex items-center gap-2">
          <Skeleton className="h-6 w-24 rounded-full" />
          <ButtonSkeleton className="w-16" />
        </div>
      }
    >
      <div className="grid gap-5 sm:grid-cols-3">
        <DetailSkeleton
          label="Reference numbers"
          className="sm:col-span-3"
          width="w-40"
        />
        <DetailSkeleton label="Equipment" width="w-16" />
        <DetailSkeleton label="Commodity" width="w-24" />
        <DetailSkeleton label="Weight" width="w-20" />
        <DetailSkeleton label="Trailer number" width="w-16" />
        <DetailSkeleton label="Notes" className="sm:col-span-2" width="w-48" />
      </div>
    </SettingsCard>
  )
}

/** The tab row with its real labels, the first one selected. */
function LoadTabBarSkeleton() {
  return (
    <div className="-mx-4 overflow-x-auto px-4 lg:mx-0 lg:px-0">
      <div className="inline-flex h-9 w-max items-center rounded-lg bg-muted p-[3px] text-muted-foreground">
        {LOAD_TABS.map((tab, index) => (
          <span
            key={tab}
            className={cn(
              "inline-flex h-full items-center rounded-md px-3 text-sm font-medium whitespace-nowrap",
              index === 0
                ? "bg-background text-foreground shadow-sm dark:bg-input/30"
                : "text-foreground/60 dark:text-muted-foreground"
            )}
          >
            {LOAD_TAB_LABELS[tab]}
          </span>
        ))}
      </div>
    </div>
  )
}

/** A Save button on the right of a card's footer, with a hint beside it. */
function SaveFooterSkeleton({ hint }: { hint?: React.ReactNode }) {
  return (
    <SettingsCardFooter
      hint={hint ?? <Skeleton className="h-4 w-56 bg-foreground/10" />}
    >
      <Skeleton className="h-8 w-20 rounded-md bg-foreground/10" />
    </SettingsCardFooter>
  )
}

function AssignmentCardSkeleton() {
  return (
    <SettingsCard
      title="Assignment"
      description={
        <span className="inline-block h-4 w-44 animate-pulse rounded-md bg-muted align-middle" />
      }
      contentClassName="flex flex-col gap-5"
      footer={<SaveFooterSkeleton />}
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <FieldSkeleton label="Truck" />
        <FieldSkeleton label="Driver" />
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <FieldSkeleton label="Estimated loaded miles" />
        <FieldSkeleton label="Estimated empty miles" />
      </div>
    </SettingsCard>
  )
}

/** One stop as the Stops card lists it: where, when, and its check-ins. */
function StopLineSkeleton({
  number,
  kind,
}: {
  number: number
  kind: "pickup" | "delivery"
}) {
  return (
    <li className="flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 gap-3">
        <span
          className={cn(
            "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
            kind === "pickup"
              ? "bg-sky-500/10 text-sky-700 dark:text-sky-300"
              : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
          )}
        >
          {number}
        </span>
        <div className="min-w-0 space-y-0.5 text-sm">
          <p className="font-medium">
            {kind === "pickup" ? "Pickup" : "Delivery"}
          </p>
          <Line className="w-40" />
          <Line className="w-52" />
          <Line className="w-36" />
        </div>
      </div>
      <div className="flex shrink-0 flex-col gap-1.5 pl-10 sm:items-end sm:pl-0">
        <Line className="w-28" />
        <Line className="w-28" />
      </div>
    </li>
  )
}

function StopsCardSkeleton() {
  return (
    <SettingsCard
      title="Stops"
      description={
        <span className="inline-block h-4 w-48 animate-pulse rounded-md bg-muted align-middle" />
      }
      action={<ButtonSkeleton className="w-24" />}
      contentClassName="px-0 pb-0"
      footer={
        <SettingsCardFooter
          hint={<Skeleton className="h-4 w-72 max-w-full bg-foreground/10" />}
        />
      }
    >
      <ol className="divide-y border-t">
        <StopLineSkeleton number={1} kind="pickup" />
        <StopLineSkeleton number={2} kind="delivery" />
      </ol>
    </SettingsCard>
  )
}

function CustomerCardSkeleton() {
  return (
    <SettingsCard
      title="Customer"
      description={
        <span className="inline-block h-4 w-64 max-w-full animate-pulse rounded-md bg-muted align-middle" />
      }
      contentClassName="grid gap-5 sm:grid-cols-6"
      footer={
        <SaveFooterSkeleton hint="Linking a broker re-checks them with FMCSA." />
      }
    >
      <FieldSkeleton label="Customer" className="sm:col-span-3" />
      <Field className="sm:col-span-3">
        <FieldLabel>MC number</FieldLabel>
        <div className="flex gap-2">
          <Skeleton className="h-9 flex-1" />
          <Skeleton className="size-9 rounded-md" />
        </div>
      </Field>
      <FieldSkeleton label="Rate con from" className="sm:col-span-6" />
    </SettingsCard>
  )
}

/** A charge or expense line: what it is on the left, the amount on the right. */
function AmountLineSkeleton({
  what,
  sub,
}: {
  what: string
  /** A second, muted line, like an expense's date. */
  sub?: string
}) {
  return (
    <li
      className={cn(
        "flex items-center justify-between gap-3 px-6 text-sm",
        sub ? "py-3" : "py-2.5"
      )}
    >
      <div className="min-w-0">
        <Line className={what} />
        {sub && <Line className={cn("h-3.5", sub)} />}
      </div>
      <Skeleton className="h-4 w-16" />
    </li>
  )
}

function ChargesCardSkeleton() {
  return (
    <SettingsCard
      title="Charges"
      description={
        <span className="inline-block h-4 w-56 max-w-full animate-pulse rounded-md bg-muted align-middle" />
      }
      action={
        <div className="flex flex-wrap justify-end gap-2">
          <ButtonSkeleton className="w-28" />
          <ButtonSkeleton className="w-36" />
        </div>
      }
      contentClassName="px-0 pb-0"
      footer={
        <SettingsCardFooter
          hint={<Skeleton className="h-4 w-72 max-w-full bg-foreground/10" />}
        />
      }
    >
      <ul className="border-t">
        <li className="px-6 pt-3 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Rate con
        </li>
        <AmountLineSkeleton what="w-28" />
        <li className="mt-1 flex items-center justify-between gap-3 border-t px-6 py-3 text-sm">
          <span className="font-semibold">Total</span>
          <Skeleton className="h-4 w-16" />
        </li>
      </ul>
    </SettingsCard>
  )
}

function ExpensesCardSkeleton() {
  return (
    <SettingsCard
      title="Expenses"
      description="Fuel, tolls, lumper and other costs on this trip."
      action={<ButtonSkeleton className="w-28" />}
      contentClassName="px-0 pb-0"
    >
      <ul className="divide-y border-t">
        <AmountLineSkeleton what="w-32" sub="w-40" />
        <AmountLineSkeleton what="w-24" sub="w-36" />
      </ul>
    </SettingsCard>
  )
}

function HistoryCardSkeleton() {
  return (
    <SettingsCard
      title="History"
      description={
        <span className="inline-block h-4 w-40 animate-pulse rounded-md bg-muted align-middle" />
      }
    >
      <ol className="flex flex-col gap-3">
        {["w-48", "w-40"].map((width, index) => (
          <li key={index} className="flex items-start gap-3 text-sm">
            <Skeleton className="mt-0.5 size-6 shrink-0 rounded-full" />
            <div className="min-w-0">
              <Line className={width} />
              <Line className="w-36" />
            </div>
          </li>
        ))}
      </ol>
    </SettingsCard>
  )
}

/** Each load tab's cards while it loads, as the page stacks them. */
export const LOAD_TAB_SKELETONS: Record<LoadTab, React.ReactNode> = {
  trip: (
    <>
      <AssignmentCardSkeleton />
      <StopsCardSkeleton />
    </>
  ),
  billing: (
    <>
      <CustomerCardSkeleton />
      <ChargesCardSkeleton />
    </>
  ),
  expenses: <ExpensesCardSkeleton />,
  history: <HistoryCardSkeleton />,
}

/** The side panel: the next step, the documents checklist and the money. */
function LoadSidePanelSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <section className="overflow-hidden rounded-xl border bg-card px-5 pt-4 pb-5 shadow-xs">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Next step
        </p>
        <div className="mt-1 flex h-7 items-center">
          <Skeleton className="h-5 w-40" />
        </div>
        <Line spacing="mt-1" className="w-full" />
        <Line className="w-2/3" />
        <div className="mt-4 flex flex-col gap-2">
          <Skeleton className="h-10 w-full rounded-md bg-foreground/10" />
        </div>
      </section>
      <Panel title="Documents">
        <ul className="flex flex-col divide-y">
          {["w-16", "w-10", "w-10", "w-14"].map((width, index) => (
            <li
              key={index}
              className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
            >
              <span className="flex items-center gap-2">
                <Skeleton className="size-4 rounded-full" />
                <Line className={width} />
              </span>
              <Skeleton className="h-6 w-16 rounded-md" />
            </li>
          ))}
        </ul>
      </Panel>
      <Panel title="Money">
        <div className="flex flex-col gap-2">
          <MoneyLine label="Revenue">
            <Skeleton className="inline-block h-4 w-16 align-middle" />
          </MoneyLine>
          <MoneyLine label="Driver pay" muted>
            <Skeleton className="inline-block h-4 w-16 align-middle" />
          </MoneyLine>
          <div className="my-1 border-t" />
          <MoneyLine label={<Skeleton className="h-5 w-16" />} strong>
            <Skeleton className="inline-block h-5 w-20 align-middle" />
          </MoneyLine>
          <Line className="w-full" />
          <Line spacing="mt-1" className="w-3/4" />
        </div>
      </Panel>
    </div>
  )
}

export function LoadDetailSkeleton() {
  return (
    <div className="px-4 py-6 lg:px-6 lg:py-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <BackLinkSkeleton />
        <div className="grid items-start gap-6 @4xl/main:grid-cols-[minmax(0,1fr)_20rem] @6xl/main:grid-cols-[minmax(0,1fr)_24rem]">
          <div className="flex min-w-0 flex-col gap-6">
            <LoadDetailsCardSkeleton />
            <LoadTabBarSkeleton />
            <div className="flex min-w-0 flex-col gap-6">
              {LOAD_TAB_SKELETONS.trip}
            </div>
          </div>
          <LoadSidePanelSkeleton />
        </div>
      </div>
    </div>
  )
}
