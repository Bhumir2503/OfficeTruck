"use client"

import { cn } from "cn"
import {
  CircleCheck,
  Download,
  FileUp,
  Fuel,
  MapPinned,
  Plus,
  Route,
  Trash2,
  Undo2,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMemo, useState, useTransition } from "react"
import { toast } from "sonner"

import {
  removeFuelPurchase,
  removeStateMiles,
  unmarkIftaFiled,
} from "@/app/org/[slug]/ifta/actions"
import {
  AddFuelDialog,
  AddMilesDialog,
  MarkFiledDialog,
  type TruckOption,
} from "@/components/ifta/ifta-dialogs"
import { IftaImportDialog } from "@/components/ifta/ifta-import-dialog"
import {
  SettingsCard,
  SettingsCardFooter,
  SettingsEmptyState,
} from "@/components/settings/settings-card"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { expiry, formatDate, inDays } from "@/lib/driver-format"
import type { IftaFuelRow, IftaMilesRow } from "@/lib/ifta"
import {
  dueDate,
  iftaSummary,
  isIftaJurisdiction,
  JURISDICTION_NAMES,
  quarterKey,
  quarterLabel,
  summaryCsv,
  type Quarter,
} from "@/lib/ifta-format"
import { formatRate } from "@/lib/load-format"

const whole = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 })
const gallons = new Intl.NumberFormat("en-US", { maximumFractionDigits: 3 })

const TABLE =
  "[&_td:first-child]:pl-6 [&_td:last-child]:pr-6 [&_th:first-child]:pl-6 [&_th:last-child]:pr-6"

const stateName = (code: string) =>
  isIftaJurisdiction(code) ? JURISDICTION_NAMES[code] : code

/** Whether the return is filed, due, or late. */
function FilingStatus({
  quarter,
  filedOn,
  today,
}: {
  quarter: Quarter
  filedOn: string | null
  today: string
}) {
  if (filedOn) {
    return (
      <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
        <CircleCheck className="size-3.5" aria-hidden />
        Filed {formatDate(filedOn)}
      </span>
    )
  }
  const due = dueDate(quarter)
  const left = expiry(due, today)
  if (left.state === "expired") {
    return (
      <span className="font-medium text-destructive">
        Due {formatDate(due)}, {whole.format(left.days)}{" "}
        {left.days === 1 ? "day" : "days"} late
      </span>
    )
  }
  if (left.state === "missing") return null
  return (
    <span
      className={cn(
        left.state === "urgent" && "text-orange-700 dark:text-orange-300",
        left.state === "soon" && "text-amber-700 dark:text-amber-300"
      )}
    >
      Due {formatDate(due)} ({inDays(left.days)})
    </span>
  )
}

type Deleting =
  | { kind: "miles"; row: IftaMilesRow; truck: string }
  | { kind: "fuel"; row: IftaFuelRow; truck: string }

/**
 * The IFTA page: one quarter's return by state, and the miles and fuel it's
 * worked out from.
 */
export function IftaView({
  organizationId,
  quarter,
  quarters,
  today,
  filedOn,
  miles,
  fuel,
  trucks,
  loadMiles,
  canManage,
  base,
  loadsBase,
}: {
  organizationId: string
  quarter: Quarter
  /** The quarters to choose from, newest first. */
  quarters: Quarter[]
  /** "YYYY-MM-DD" */
  today: string
  filedOn: string | null
  miles: IftaMilesRow[]
  fuel: IftaFuelRow[]
  /** Every truck, so old entries still have a name; inactive ones last. */
  trucks: (TruckOption & { active: boolean })[]
  /** Loaded and empty miles on the quarter's delivered loads, by truck. */
  loadMiles: Record<string, number>
  canManage: boolean
  /** /org/<slug>/ifta */
  base: string
  /** /org/<slug>/loads */
  loadsBase: string
}) {
  const router = useRouter()
  const [addingMiles, setAddingMiles] = useState(false)
  const [addingFuel, setAddingFuel] = useState(false)
  const [markingFiled, setMarkingFiled] = useState(false)
  const [importing, setImporting] = useState<"miles" | "fuel" | null>(null)
  // A fresh form each time a dialog opens.
  const [dialogKey, setDialogKey] = useState(0)
  const [deleting, setDeleting] = useState<Deleting | null>(null)
  const [pending, start] = useTransition()

  const choices = trucks.filter((truck) => truck.active)
  const [truckId, setTruckId] = useState(
    choices.length === 1 ? choices[0]!.id : ""
  )

  const names = useMemo(
    () => new Map(trucks.map((truck) => [truck.id, truck.name])),
    [trucks]
  )
  const nameOf = (id: string) => names.get(id) ?? "Removed truck"

  const summary = useMemo(() => iftaSummary(miles, fuel), [miles, fuel])
  const label = quarterLabel(quarter)

  // Miles grouped by truck, trucks in the order they're listed.
  const byTruck = useMemo(() => {
    const order = new Map(trucks.map((truck, i) => [truck.id, i]))
    const groups = new Map<string, IftaMilesRow[]>()
    for (const row of miles) {
      groups.set(row.truck_id, [...(groups.get(row.truck_id) ?? []), row])
    }
    // Trucks with load miles but nothing entered, so the gap shows.
    for (const [id, onLoads] of Object.entries(loadMiles)) {
      if (onLoads > 0 && !groups.has(id)) groups.set(id, [])
    }
    return [...groups.entries()].sort(
      ([a], [b]) => (order.get(a) ?? 1e9) - (order.get(b) ?? 1e9)
    )
  }, [miles, trucks, loadMiles])

  function open(set: (open: boolean) => void) {
    setDialogKey((key) => key + 1)
    set(true)
  }

  function remove() {
    if (!deleting) return
    const target = deleting
    start(async () => {
      const result =
        target.kind === "miles"
          ? await removeStateMiles(organizationId, target.row.id)
          : await removeFuelPurchase(organizationId, target.row.id)
      if ("error" in result) {
        toast.error(result.error)
        return
      }
      toast.success(
        target.kind === "miles" ? "Miles deleted." : "Purchase deleted."
      )
      setDeleting(null)
    })
  }

  function unmark() {
    start(async () => {
      const result = await unmarkIftaFiled(organizationId, quarter)
      if ("error" in result) toast.error(result.error)
      else toast.success(`${label} is no longer marked as filed.`)
    })
  }

  function download() {
    const blob = new Blob([summaryCsv(summary.lines)], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `ifta-${quarterKey(quarter)}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  const quarterItems = quarters.map((q) => ({
    value: quarterKey(q),
    label: quarterLabel(q, true),
  }))
  const noTrucks = choices.length === 0

  return (
    <div className="flex flex-col gap-6">
      <SettingsCard
        title={`Return for ${quarterLabel(quarter, true)}`}
        description={
          <>
            <FilingStatus quarter={quarter} filedOn={filedOn} today={today} />
            <span className="block">
              Net taxable gallons by state, ready to enter on your base
              state&apos;s IFTA site, which applies the quarter&apos;s tax
              rates.
            </span>
          </>
        }
        action={
          <div className="flex shrink-0 flex-wrap justify-end gap-2">
            <Select
              value={quarterKey(quarter)}
              onValueChange={(value) => {
                if (value) router.push(`${base}?q=${value}`)
              }}
              items={quarterItems}
            >
              <SelectTrigger aria-label="Quarter" className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {quarterItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {canManage &&
              (filedOn ? (
                <Button variant="ghost" disabled={pending} onClick={unmark}>
                  <Undo2 />
                  Unmark filed
                </Button>
              ) : (
                <Button variant="outline" onClick={() => open(setMarkingFiled)}>
                  <CircleCheck />
                  Mark as filed
                </Button>
              ))}
          </div>
        }
        contentClassName={
          summary.lines.length ? "@container px-0 pb-0" : undefined
        }
        footer={
          summary.lines.length > 0 && (
            <SettingsCardFooter
              hint={
                summary.mpg === null
                  ? summary.totalMiles === 0
                    ? "Add miles by state to work out the fleet's MPG and taxable gallons."
                    : "Add fuel purchases to work out the fleet's MPG and taxable gallons."
                  : `Fleet MPG ${summary.mpg.toFixed(2)}: ${whole.format(summary.totalMiles)} miles on ${gallons.format(summary.totalGallons)} gallons.`
              }
            >
              <Button variant="outline" size="sm" onClick={download}>
                <Download />
                Download CSV
              </Button>
            </SettingsCardFooter>
          )
        }
      >
        {summary.lines.length === 0 ? (
          <SettingsEmptyState
            icon={MapPinned}
            title="Nothing for this quarter yet"
          >
            Add each truck&apos;s miles by state and its fuel purchases below,
            and the return fills in here.
          </SettingsEmptyState>
        ) : (
          <Table className={TABLE}>
            <TableHeader className="bg-muted/40">
              <TableRow>
                <TableHead className="w-full">State</TableHead>
                <TableHead className="w-px text-right">Miles</TableHead>
                <TableHead className="hidden w-px text-right whitespace-nowrap @lg:table-cell">
                  Taxable gal
                </TableHead>
                <TableHead className="hidden w-px text-right whitespace-nowrap @lg:table-cell">
                  Bought gal
                </TableHead>
                <TableHead className="w-px text-right whitespace-nowrap">
                  Net gal
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {summary.lines.map((line) => (
                <TableRow key={line.jurisdiction}>
                  <TableCell className="max-w-0 py-3">
                    <span className="font-medium">{line.jurisdiction}</span>
                    <span className="ml-2 truncate text-muted-foreground">
                      {stateName(line.jurisdiction)}
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {whole.format(line.miles)}
                  </TableCell>
                  <TableCell className="hidden text-right text-muted-foreground tabular-nums @lg:table-cell">
                    {line.taxable === null ? "—" : whole.format(line.taxable)}
                  </TableCell>
                  <TableCell className="hidden text-right text-muted-foreground tabular-nums @lg:table-cell">
                    {gallons.format(line.purchased)}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right font-medium tabular-nums",
                      line.net !== null &&
                        line.net < 0 &&
                        "text-emerald-700 dark:text-emerald-400"
                    )}
                  >
                    {line.net === null ? "—" : gallons.format(line.net)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell className="font-medium">Total</TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  {whole.format(summary.totalMiles)}
                </TableCell>
                <TableCell className="hidden @lg:table-cell" />
                <TableCell className="hidden text-right font-medium tabular-nums @lg:table-cell">
                  {gallons.format(summary.totalGallons)}
                </TableCell>
                <TableCell />
              </TableRow>
            </TableFooter>
          </Table>
        )}
      </SettingsCard>

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-2">
        <SettingsCard
          title="Miles by state"
          description="Each truck's miles in each state this quarter, beside the miles on its delivered loads as a check."
          action={
            canManage && (
              <div className="flex shrink-0 gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={noTrucks}
                  onClick={() => {
                    setDialogKey((key) => key + 1)
                    setImporting("miles")
                  }}
                >
                  <FileUp />
                  Import CSV
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={noTrucks}
                  onClick={() => open(setAddingMiles)}
                >
                  <Plus />
                  Add miles
                </Button>
              </div>
            )
          }
          contentClassName={byTruck.length ? "@container px-0 pb-0" : undefined}
        >
          {byTruck.length === 0 ? (
            <SettingsEmptyState icon={Route} title="No miles entered">
              {noTrucks
                ? "Add an active truck first."
                : canManage
                  ? "Enter them from trip sheets or your ELD's state mileage report."
                  : "Owners and admins enter miles here."}
            </SettingsEmptyState>
          ) : (
            <Table className={TABLE}>
              <TableHeader className="bg-muted/40">
                <TableRow>
                  <TableHead className="w-full">State</TableHead>
                  <TableHead className="w-px text-right">Miles</TableHead>
                  <TableHead className="w-px">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {byTruck.map(([id, rows]) => {
                  const entered = rows.reduce((sum, row) => sum + row.miles, 0)
                  const onLoads = loadMiles[id]
                  const off =
                    onLoads !== undefined &&
                    onLoads > 0 &&
                    Math.abs(entered - onLoads) / onLoads > 0.1
                  return [
                    <TableRow
                      key={id}
                      className="bg-muted/20 hover:bg-muted/20"
                    >
                      <TableCell colSpan={3} className="py-2">
                        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                          <span className="font-medium">{nameOf(id)}</span>
                          <span
                            className={cn(
                              "text-xs text-muted-foreground tabular-nums",
                              off && "text-amber-700 dark:text-amber-300"
                            )}
                          >
                            {whole.format(entered)} mi entered
                            {onLoads !== undefined &&
                              ` · ${whole.format(onLoads)} mi on loads`}
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>,
                    ...rows.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="max-w-0">
                          <span className="font-medium">
                            {row.jurisdiction}
                          </span>
                          <span className="ml-2 truncate text-muted-foreground">
                            {stateName(row.jurisdiction)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {whole.format(row.miles)}
                        </TableCell>
                        <TableCell>
                          {canManage && (
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="hover:text-destructive"
                              aria-label={`Delete ${nameOf(id)}'s ${row.jurisdiction} miles`}
                              disabled={pending}
                              onClick={() =>
                                setDeleting({
                                  kind: "miles",
                                  row,
                                  truck: nameOf(id),
                                })
                              }
                            >
                              <Trash2 />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    )),
                  ]
                })}
              </TableBody>
            </Table>
          )}
        </SettingsCard>

        <SettingsCard
          title="Fuel purchases"
          description="Every gallon bought this quarter, with the state it was bought in. Fuel receipts on loads count here once they have gallons and a state."
          action={
            canManage && (
              <div className="flex shrink-0 gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={noTrucks}
                  onClick={() => {
                    setDialogKey((key) => key + 1)
                    setImporting("fuel")
                  }}
                >
                  <FileUp />
                  Import CSV
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={noTrucks}
                  onClick={() => open(setAddingFuel)}
                >
                  <Plus />
                  Add fuel
                </Button>
              </div>
            )
          }
          contentClassName={fuel.length ? "@container px-0 pb-0" : undefined}
          footer={
            fuel.length > 0 && (
              <SettingsCardFooter
                hint={`${fuel.length} ${fuel.length === 1 ? "purchase" : "purchases"}, ${gallons.format(summary.totalGallons)} gallons`}
              />
            )
          }
        >
          {fuel.length === 0 ? (
            <SettingsEmptyState icon={Fuel} title="No fuel entered">
              {noTrucks
                ? "Add an active truck first."
                : canManage
                  ? "Enter each fill-up from the receipt or your fuel card statement."
                  : "Owners and admins enter fuel here."}
            </SettingsEmptyState>
          ) : (
            <Table className={TABLE}>
              <TableHeader className="bg-muted/40">
                <TableRow>
                  <TableHead className="w-px">Date</TableHead>
                  <TableHead className="w-full">Truck</TableHead>
                  <TableHead className="w-px text-right">Gallons</TableHead>
                  <TableHead className="hidden w-px text-right @md:table-cell">
                    Amount
                  </TableHead>
                  <TableHead className="w-px">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fuel.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="whitespace-nowrap tabular-nums">
                      {formatDate(row.purchased_on)}
                    </TableCell>
                    <TableCell className="max-w-0 py-3">
                      <div className="truncate font-medium">
                        {nameOf(row.truck_id)}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {[row.jurisdiction, row.vendor]
                          .filter(Boolean)
                          .join(" · ")}
                        {row.load && (
                          <>
                            {" · "}
                            <Link
                              href={`${loadsBase}/${row.load.id}`}
                              className="underline-offset-4 hover:text-foreground hover:underline"
                            >
                              Load {row.load.reference}
                            </Link>
                          </>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {gallons.format(row.gallons)}
                    </TableCell>
                    <TableCell className="hidden text-right text-muted-foreground tabular-nums @md:table-cell">
                      {row.amount === null ? "—" : formatRate(row.amount)}
                    </TableCell>
                    <TableCell>
                      {/* A load's fuel receipt is changed on the load. */}
                      {canManage && !row.load && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="hover:text-destructive"
                          aria-label={`Delete the ${formatDate(row.purchased_on)} purchase`}
                          disabled={pending}
                          onClick={() =>
                            setDeleting({
                              kind: "fuel",
                              row,
                              truck: nameOf(row.truck_id),
                            })
                          }
                        >
                          <Trash2 />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </SettingsCard>
      </div>

      {canManage && (
        <>
          <AddMilesDialog
            key={`miles-${dialogKey}`}
            organizationId={organizationId}
            quarter={quarter}
            trucks={choices}
            truckId={truckId}
            onTruckChange={setTruckId}
            open={addingMiles}
            onOpenChange={setAddingMiles}
          />
          <AddFuelDialog
            key={`fuel-${dialogKey}`}
            organizationId={organizationId}
            quarter={quarter}
            today={today}
            trucks={choices}
            truckId={truckId}
            onTruckChange={setTruckId}
            open={addingFuel}
            onOpenChange={setAddingFuel}
          />
          <MarkFiledDialog
            key={`filed-${dialogKey}`}
            organizationId={organizationId}
            quarter={quarter}
            today={today}
            open={markingFiled}
            onOpenChange={setMarkingFiled}
          />
          {importing && (
            <IftaImportDialog
              key={`import-${dialogKey}`}
              kind={importing}
              organizationId={organizationId}
              quarter={quarter}
              trucks={choices}
              open
              onOpenChange={(next) => !next && setImporting(null)}
            />
          )}
        </>
      )}

      <Dialog
        open={deleting !== null}
        onOpenChange={(next) => !pending && !next && setDeleting(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {deleting?.kind === "fuel"
                ? "Delete this purchase?"
                : "Delete these miles?"}
            </DialogTitle>
            <DialogDescription>
              {deleting?.kind === "miles"
                ? `${deleting.truck}'s ${whole.format(deleting.row.miles)} miles in ${stateName(deleting.row.jurisdiction)} will be deleted. This can't be undone.`
                : deleting?.kind === "fuel"
                  ? `${gallons.format(deleting.row.gallons)} gallons for ${deleting.truck} on ${formatDate(deleting.row.purchased_on)} will be deleted. This can't be undone.`
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
    </div>
  )
}
