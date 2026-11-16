import { SettingsCard } from "@/components/settings/settings-card"
import { Skeleton } from "@/components/ui/skeleton"

/*
 * Loading state for the Reports page. Labels that don't depend on data are
 * real, so nothing shifts when the content arrives. Keep the page wrapper in
 * step with the page.
 */

const STATS = [
  "Revenue",
  "Profit",
  "Rate per mile",
  "Cost per mile",
  "Empty miles",
]

export function ReportsSkeleton() {
  return (
    <div className="px-4 py-6 lg:px-6 lg:py-8">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">
              Delivered loads by delivery date. Profit is before fixed costs
              like insurance and truck payments.
            </p>
          </div>
          <Skeleton className="h-8 w-full max-w-xl" />
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-5">
          {STATS.map((label) => (
            <div
              key={label}
              className="rounded-xl border bg-card px-5 py-4 shadow-xs"
            >
              <p className="text-sm text-muted-foreground">{label}</p>
              <Skeleton className="mt-2 h-7 w-24" />
              <Skeleton className="mt-2 h-3 w-20" />
            </div>
          ))}
        </div>
        <SettingsCard
          title="Last 12 months"
          description="Revenue and profit by the month each load delivered."
        >
          <Skeleton className="h-64 w-full" />
        </SettingsCard>
        <SettingsCard title="Breakdown">
          <Skeleton className="h-40 w-full" />
        </SettingsCard>
      </div>
    </div>
  )
}
