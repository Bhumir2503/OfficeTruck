"use client"

import { Building2, Search } from "lucide-react"
import Link from "next/link"
import { useMemo, useState } from "react"

import { DoNotUseBadge, FmcsaBadge } from "@/components/brokers/broker-badges"
import {
  SettingsCard,
  SettingsCardFooter,
  SettingsEmptyState,
} from "@/components/settings/settings-card"
import { buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { fmcsaFlags, formatMc, formatTerms } from "@/lib/broker-format"
import type { BrokerWithFmcsa } from "@/lib/brokers"

type Filter = "all" | "flagged" | "do_not_use"

const FILTER_LABELS: Record<Filter, string> = {
  all: "All",
  flagged: "Flagged",
  do_not_use: "Do not use",
}

function plural(count: number, word: string) {
  return `${count} ${count === 1 ? word : `${word}s`}`
}

/** Do-not-use, or an FMCSA flag of either tone. */
function isFlagged(broker: BrokerWithFmcsa) {
  return broker.do_not_use || fmcsaFlags(broker.fmcsa).length > 0
}

export function BrokersTable({
  brokers,
  base,
}: {
  brokers: BrokerWithFmcsa[]
  /** /org/<slug>/brokers */
  base: string
}) {
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState<Filter>("all")

  const counts = useMemo(
    () => ({
      all: brokers.length,
      flagged: brokers.filter(isFlagged).length,
      do_not_use: brokers.filter((broker) => broker.do_not_use).length,
    }),
    [brokers]
  )

  const filtered = useMemo(() => {
    const query = search
      .trim()
      .toLowerCase()
      .replace(/^mc[-#\s]*/, "")
    return brokers.filter(
      (broker) =>
        (filter === "all" ||
          (filter === "flagged" && isFlagged(broker)) ||
          (filter === "do_not_use" && broker.do_not_use)) &&
        [broker.legal_name, broker.dba_name, broker.mc_number].some((value) =>
          value?.toLowerCase().includes(query)
        )
    )
  }, [brokers, filter, search])

  const addButton = (size: "sm" | "default") => (
    <Link href={`${base}/new`} className={buttonVariants({ size })}>
      <Building2 />
      Add broker
    </Link>
  )

  if (brokers.length === 0) {
    return (
      <SettingsCard title="Brokers">
        <SettingsEmptyState icon={Building2} title="No brokers yet">
          Add the brokers you haul for. Look one up by MC number to check their
          authority with FMCSA, and keep their billing details for invoices.
        </SettingsEmptyState>
        <div className="mt-4 flex justify-center">{addButton("default")}</div>
      </SettingsCard>
    )
  }

  const filtering = search.trim() !== "" || filter !== "all"

  return (
    <SettingsCard
      title="Brokers"
      description="Search by name or MC number."
      action={addButton("sm")}
      contentClassName="px-0 pb-0"
      footer={
        <SettingsCardFooter
          hint={
            filtering
              ? `Showing ${filtered.length} of ${plural(brokers.length, "broker")}`
              : plural(brokers.length, "broker")
          }
        />
      }
    >
      <div className="flex flex-col gap-3 px-6 pb-4 sm:flex-row sm:items-center">
        <div className="relative w-full">
          <Search className="absolute top-1/2 left-2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search name or MC"
            aria-label="Search brokers"
            className="pl-7"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <ToggleGroup
          aria-label="Filter brokers"
          variant="outline"
          size="sm"
          spacing={1}
          className="shrink-0"
          value={[filter]}
          onValueChange={(value: string[]) =>
            setFilter((value[0] as Filter | undefined) ?? "all")
          }
        >
          {(Object.keys(FILTER_LABELS) as Filter[]).map((key) => (
            <ToggleGroupItem key={key} value={key}>
              {FILTER_LABELS[key]}
              <span className="text-muted-foreground tabular-nums">
                {counts[key]}
              </span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      <Table className="[&_td:first-child]:pl-6 [&_td:last-child]:pr-6 [&_th:first-child]:pl-6 [&_th:last-child]:pr-6">
        <TableHeader className="bg-muted/40">
          <TableRow>
            <TableHead>Broker</TableHead>
            <TableHead className="hidden md:table-cell">Terms</TableHead>
            <TableHead className="hidden lg:table-cell">Invoices</TableHead>
            <TableHead className="text-right sm:text-left">FMCSA</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={4}
                className="h-24 text-center text-muted-foreground"
              >
                {search.trim() === "" && filter !== "all"
                  ? `No ${FILTER_LABELS[filter].toLowerCase()} brokers.`
                  : "No brokers match your search."}
              </TableCell>
            </TableRow>
          )}
          {filtered.map((broker) => (
            <TableRow key={broker.id}>
              <TableCell className="max-w-72 py-3">
                <div className="flex items-center gap-2">
                  <Link
                    href={`${base}/${broker.id}`}
                    className="truncate font-medium hover:underline"
                  >
                    {broker.legal_name}
                  </Link>
                  {broker.do_not_use && <DoNotUseBadge />}
                </div>
                <div className="truncate text-sm text-muted-foreground">
                  {[
                    formatMc(broker.mc_number),
                    broker.dba_name && `DBA ${broker.dba_name}`,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "No MC number"}
                </div>
              </TableCell>
              <TableCell className="hidden text-sm md:table-cell">
                {formatTerms(
                  broker.payment_terms_days,
                  broker.quick_pay_fee_percent
                )}
              </TableCell>
              <TableCell className="hidden text-sm lg:table-cell">
                {broker.invoice_method === "portal" ? (
                  <span className="text-muted-foreground">
                    Portal, manual upload
                  </span>
                ) : (
                  <span className="block max-w-56 truncate">
                    {broker.billing_emails[0] ?? "—"}
                    {broker.billing_emails.length > 1 &&
                      ` +${broker.billing_emails.length - 1}`}
                  </span>
                )}
                {broker.factored && (
                  <span className="block text-xs text-muted-foreground">
                    Factored
                    {broker.noa_on_file ? ", NOA on file" : ", no NOA yet"}
                  </span>
                )}
              </TableCell>
              <TableCell className="text-right sm:text-left">
                <div className="flex justify-end sm:justify-start">
                  <FmcsaBadge
                    record={broker.fmcsa}
                    hasMc={!!broker.mc_number}
                  />
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </SettingsCard>
  )
}
