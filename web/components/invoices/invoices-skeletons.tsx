import { cn } from "cn"

import {
  SettingsCard,
  SettingsCardFooter,
} from "@/components/settings/settings-card"
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
 * Loading states for the Invoices pages. Text that doesn't depend on data is
 * real and built from the same pieces as the pages, so nothing shifts when
 * the content arrives. Keep the page wrappers in step with the pages.
 */

function Line({ className }: { className?: string }) {
  return (
    <div className="flex h-5 items-center">
      <Skeleton className={cn("h-4", className)} />
    </div>
  )
}

const STATS = [
  "Ready to invoice",
  "Waiting on pay",
  "Overdue",
  "Paid, last 30 days",
]
const ROWS = ["w-24", "w-32", "w-28"]
const TABLE =
  "[&_td:first-child]:pl-6 [&_td:last-child]:pr-6 [&_th:first-child]:pl-6 [&_th:last-child]:pr-6"

export function InvoicesListSkeleton() {
  return (
    <div className="px-4 py-6 lg:px-6 lg:py-8">
      <div className="flex flex-col gap-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {STATS.map((label) => (
            <div
              key={label}
              className="rounded-xl border bg-card px-5 py-4 shadow-xs"
            >
              <p className="text-sm text-muted-foreground">{label}</p>
              <Skeleton className="mt-2 h-7 w-28" />
              <Skeleton className="mt-2 h-3 w-14" />
            </div>
          ))}
        </div>

        <SettingsCard
          title="Ready to invoice"
          description="Delivered and TONU loads with no invoice yet. Make a draft, check it, then send it with the paperwork attached."
          contentClassName="px-0 pb-0"
          footer={
            <SettingsCardFooter
              hint={<Skeleton className="h-4 w-16 bg-foreground/10" />}
            />
          }
        >
          <Table className={TABLE}>
            <TableHeader className="bg-muted/40">
              <TableRow>
                <TableHead className="w-full">Load</TableHead>
                <TableHead className="w-px text-right">Amount</TableHead>
                <TableHead className="w-px" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {ROWS.slice(0, 2).map((width, index) => (
                <TableRow key={index}>
                  <TableCell className="py-3">
                    <Line className={width} />
                    <Line className="w-40" />
                  </TableCell>
                  <TableCell>
                    <Line className="ml-auto w-16" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-8 w-32 rounded-md" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </SettingsCard>

        <SettingsCard
          title="Invoices"
          description="Search by invoice number, load number or broker."
          contentClassName="px-0 pb-0"
          footer={
            <SettingsCardFooter
              hint={<Skeleton className="h-4 w-20 bg-foreground/10" />}
            />
          }
        >
          <div className="flex flex-col gap-3 px-6 pb-4 sm:flex-row sm:items-center">
            <Skeleton className="h-9 w-full" />
            {/* The status filter's dropdown. */}
            <Skeleton className="h-9 w-full shrink-0 rounded-md sm:w-44" />
          </div>
          <Table className={TABLE}>
            <TableHeader className="bg-muted/40">
              <TableRow>
                <TableHead className="w-px">Invoice</TableHead>
                <TableHead className="w-full">Load</TableHead>
                <TableHead className="w-px text-right">Amount</TableHead>
                <TableHead className="w-px">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ROWS.map((width, index) => (
                <TableRow key={index}>
                  <TableCell className="py-3">
                    <Line className="w-12" />
                  </TableCell>
                  <TableCell>
                    <Line className={width} />
                    <Line className="w-40" />
                  </TableCell>
                  <TableCell>
                    <Line className="ml-auto w-16" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-6 w-14 rounded-4xl" />
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

export function InvoiceSkeleton() {
  return (
    <div className="px-4 py-6 lg:px-6 lg:py-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <Skeleton className="h-8 w-28 rounded-md" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem] 2xl:grid-cols-[minmax(0,1fr)_24rem]">
          {/* The invoice sheet */}
          <div className="flex flex-col gap-8 rounded-xl border bg-card p-6 shadow-xs sm:p-10">
            <div className="flex justify-between gap-6">
              <div className="flex flex-col gap-2">
                <Skeleton className="h-3 w-12" />
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-28" />
              </div>
              <div className="flex flex-col items-end gap-2">
                <Skeleton className="h-8 w-32" />
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-4 w-36" />
              </div>
            </div>
            <div className="flex flex-col gap-2 border-t pt-6">
              <Skeleton className="h-3 w-12" />
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-4 w-36" />
            </div>
            <div className="flex flex-col gap-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-full" />
              <Skeleton className="ml-auto h-6 w-40" />
            </div>
          </div>
          {/* Beside it, the send or payment card */}
          <div className="flex flex-col gap-3 rounded-xl border bg-card px-5 pt-4 pb-5 shadow-xs">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="mt-2 h-10 w-full rounded-md" />
          </div>
        </div>
      </div>
    </div>
  )
}
