"use client"

import { cn } from "cn"
import {
  AlertCircle,
  CheckCircle2,
  FileSpreadsheet,
  Upload,
} from "lucide-react"
import { useMemo, useState, useTransition } from "react"
import { toast } from "sonner"

import {
  importFuelPurchases,
  importStateMiles,
} from "@/app/org/[slug]/ifta/actions"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
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
import { formatDate } from "@/lib/driver-format"
import { quarterLabel, type Quarter } from "@/lib/ifta-format"
import {
  combineMiles,
  FIELD_LABELS,
  FIELDS,
  guessColumns,
  MAX_IMPORT_ROWS,
  parseCsv,
  readFuelRows,
  readMilesRows,
  REQUIRED,
  type ColumnMap,
  type FuelImportRow,
  type ImportField,
  type ImportKind,
  type MilesImportRow,
  type PreviewLine,
} from "@/lib/ifta-import"

import type { TruckOption } from "./ifta-dialogs"

const NONE = "none"
const MAX_FILE_BYTES = 5 * 1024 * 1024
const whole = new Intl.NumberFormat("en-US", { maximumFractionDigits: 3 })

const COPY: Record<
  ImportKind,
  { title: string; description: string; noun: string }
> = {
  miles: {
    title: "Import miles from a CSV",
    description:
      "An ELD state mileage report or a trip-sheet spreadsheet, with a row per state. A state's miles replace what's already entered for that truck.",
    noun: "states",
  },
  fuel: {
    title: "Import fuel from a CSV",
    description:
      "A fuel card export or receipt spreadsheet, with a row per purchase. Purchases already entered are skipped.",
    noun: "purchases",
  },
}

/** The file's columns as dropdown choices, plus "not in this file". */
function ColumnSelect({
  id,
  headers,
  value,
  onChange,
}: {
  id: string
  headers: string[]
  value: number | null | undefined
  onChange: (value: number | null) => void
}) {
  const items = [
    { value: NONE, label: "Not in this file" },
    ...headers.map((header, i) => ({
      value: String(i),
      label: header || `Column ${i + 1}`,
    })),
  ]
  return (
    <Select
      value={value === null || value === undefined ? NONE : String(value)}
      onValueChange={(next) =>
        onChange(next === null || next === NONE ? null : Number(next))
      }
      items={items}
    >
      <SelectTrigger id={id} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/**
 * Imports a quarter's miles by state, or fuel purchases, from a CSV file:
 * read in the browser, columns matched by their headers (and fixable), a
 * preview of every row and why any can't be used, then one save.
 */
export function IftaImportDialog({
  kind,
  organizationId,
  quarter,
  trucks,
  open,
  onOpenChange,
}: {
  kind: ImportKind
  organizationId: string
  quarter: Quarter
  /** Active trucks. */
  trucks: TruckOption[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [file, setFile] = useState<{ name: string; rows: string[][] } | null>(
    null
  )
  const [map, setMap] = useState<ColumnMap>({})
  const [fallbackTruck, setFallbackTruck] = useState(
    trucks.length === 1 ? trucks[0]!.id : ""
  )
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [pending, start] = useTransition()
  const copy = COPY[kind]

  async function pick(chosen: File | null | undefined) {
    if (!chosen) return
    setError(null)
    if (chosen.size > MAX_FILE_BYTES) {
      setError("That file is over 5 MB. Export a shorter date range.")
      return
    }
    const rows = parseCsv(await chosen.text())
    if (rows.length < 2) {
      setError("That file has no rows under its header. Choose a CSV export.")
      return
    }
    setFile({ name: chosen.name, rows })
    setMap(guessColumns(rows[0]!, kind))
  }

  const lines = useMemo<
    PreviewLine<MilesImportRow>[] | PreviewLine<FuelImportRow>[]
  >(() => {
    if (!file) return []
    return kind === "miles"
      ? readMilesRows(file.rows, map, trucks, fallbackTruck || null)
      : readFuelRows(file.rows, map, trucks, fallbackTruck || null, quarter)
  }, [file, map, trucks, fallbackTruck, kind, quarter])

  const missing = REQUIRED[kind].filter(
    (field) => map[field] === null || map[field] === undefined
  )
  const ready = lines.filter((line) => line.row !== null)
  const problems = lines.length - ready.length
  const tooMany = file ? file.rows.length - 1 > MAX_IMPORT_ROWS : false
  // A trip sheet's many lines for one state are saved as one.
  const toSave =
    kind === "miles"
      ? combineMiles(ready.map((line) => line.row as MilesImportRow)).length
      : ready.length

  function save() {
    const rows = ready.map((line) => line.row!)
    start(async () => {
      const result =
        kind === "miles"
          ? await importStateMiles(organizationId, quarter, rows)
          : await importFuelPurchases(organizationId, rows)
      if ("error" in result) {
        setError(result.error)
        return
      }
      toast.success(
        kind === "miles"
          ? `Miles saved for ${result.saved} ${result.saved === 1 ? "state" : "states"}.`
          : `${result.saved} ${result.saved === 1 ? "purchase" : "purchases"} imported${
              result.skipped ? `, ${result.skipped} already entered` : ""
            }.`
      )
      onOpenChange(false)
    })
  }

  const truckItems = trucks.map((truck) => ({
    value: truck.id,
    label: truck.name,
  }))

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>
            {copy.description}{" "}
            {kind === "fuel"
              ? `Only purchases in ${quarterLabel(quarter, true)} are imported.`
              : `For ${quarterLabel(quarter, true)}.`}
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-w-0 flex-col gap-5">
          {/* A drop zone that's also the file picker. */}
          <label
            htmlFor={`ifta-import-${kind}`}
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
              void pick(event.dataTransfer.files[0])
            }}
          >
            <input
              id={`ifta-import-${kind}`}
              type="file"
              className="sr-only"
              accept=".csv,text/csv,.txt,text/plain"
              onChange={(event) => {
                void pick(event.target.files?.[0])
                event.target.value = ""
              }}
            />
            {file ? (
              <>
                <FileSpreadsheet className="size-5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {file.name}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {file.rows.length - 1} rows · Choose another
                </span>
              </>
            ) : (
              <>
                <Upload className="size-5 shrink-0 text-muted-foreground" />
                <span className="text-sm">
                  Drop a CSV file here, or click to choose
                </span>
              </>
            )}
          </label>

          {file && (
            <>
              <div className="grid gap-4 sm:grid-cols-3">
                {FIELDS[kind].map((field: ImportField) => (
                  <Field key={field}>
                    <FieldLabel htmlFor={`ifta-column-${field}`}>
                      {FIELD_LABELS[field]}
                      {!REQUIRED[kind].includes(field) && field !== "truck" && (
                        <span className="font-normal text-muted-foreground">
                          {" "}
                          (optional)
                        </span>
                      )}
                    </FieldLabel>
                    <ColumnSelect
                      id={`ifta-column-${field}`}
                      headers={file.rows[0]!}
                      value={map[field]}
                      onChange={(value) =>
                        setMap((current) => ({ ...current, [field]: value }))
                      }
                    />
                  </Field>
                ))}
                {(map.truck === null || map.truck === undefined) && (
                  <Field>
                    <FieldLabel htmlFor="ifta-import-truck">
                      Truck for every row
                    </FieldLabel>
                    <Select
                      value={fallbackTruck || null}
                      onValueChange={(next) =>
                        setFallbackTruck((next as string | null) ?? "")
                      }
                      items={truckItems}
                    >
                      <SelectTrigger id="ifta-import-truck" className="w-full">
                        <SelectValue placeholder="Choose a truck" />
                      </SelectTrigger>
                      <SelectContent>
                        {truckItems.map((item) => (
                          <SelectItem key={item.value} value={item.value}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                )}
              </div>

              {missing.length > 0 ? (
                <p className="text-sm text-amber-700 dark:text-amber-300">
                  Choose the{" "}
                  {missing.map((field) => FIELD_LABELS[field]).join(" and ")}{" "}
                  {missing.length === 1 ? "column" : "columns"} to see the rows.
                </p>
              ) : (
                <div className="flex min-w-0 flex-col gap-2">
                  <p className="text-sm">
                    <span className="inline-flex items-center gap-1 font-medium text-emerald-700 dark:text-emerald-400">
                      <CheckCircle2 className="size-4" aria-hidden />
                      {ready.length} {ready.length === 1 ? "row" : "rows"} ready
                    </span>
                    {problems > 0 && (
                      <span className="ml-3 inline-flex items-center gap-1 text-amber-700 dark:text-amber-300">
                        <AlertCircle className="size-4" aria-hidden />
                        {problems} {problems === 1 ? "row" : "rows"} left out
                      </span>
                    )}
                    {tooMany && (
                      <span className="ml-3 text-muted-foreground">
                        Only the first {MAX_IMPORT_ROWS} rows are read.
                      </span>
                    )}
                  </p>
                  <div className="max-h-72 overflow-auto rounded-lg border">
                    <Table>
                      <TableHeader className="sticky top-0 bg-muted">
                        <TableRow>
                          <TableHead className="w-px">Line</TableHead>
                          <TableHead>Truck</TableHead>
                          {kind === "fuel" && <TableHead>Date</TableHead>}
                          <TableHead>State</TableHead>
                          <TableHead className="text-right">
                            {kind === "miles" ? "Miles" : "Gallons"}
                          </TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {/* Rows that can't be used first, so they're seen. */}
                        {[...lines]
                          .sort(
                            (a, b) =>
                              Number(a.problem === null) -
                                Number(b.problem === null) || a.line - b.line
                          )
                          .map((line) => {
                            const row = line.row as
                              | (MilesImportRow & Partial<FuelImportRow>)
                              | (FuelImportRow & Partial<MilesImportRow>)
                              | null
                            return (
                              <TableRow key={line.line}>
                                <TableCell className="text-muted-foreground tabular-nums">
                                  {line.line}
                                </TableCell>
                                <TableCell>{line.truck ?? "—"}</TableCell>
                                {kind === "fuel" && (
                                  <TableCell className="whitespace-nowrap">
                                    {row?.purchased_on
                                      ? formatDate(row.purchased_on)
                                      : "—"}
                                  </TableCell>
                                )}
                                <TableCell>
                                  {row?.jurisdiction ?? "—"}
                                </TableCell>
                                <TableCell className="text-right tabular-nums">
                                  {row
                                    ? whole.format(
                                        (kind === "miles"
                                          ? row.miles
                                          : row.gallons) ?? 0
                                      )
                                    : "—"}
                                </TableCell>
                                <TableCell
                                  className={cn(
                                    "text-sm whitespace-nowrap",
                                    line.problem
                                      ? "text-amber-700 dark:text-amber-300"
                                      : "text-muted-foreground"
                                  )}
                                >
                                  {line.problem ?? "Ready"}
                                </TableCell>
                              </TableRow>
                            )
                          })}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </>
          )}

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            disabled={pending || missing.length > 0 || ready.length === 0}
            onClick={save}
          >
            {pending
              ? "Importing…"
              : ready.length
                ? `Import ${toSave} ${toSave === 1 ? copy.noun.slice(0, -1) : copy.noun}`
                : "Import"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
