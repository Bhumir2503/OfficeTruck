import { SettingsCard } from "@/components/settings/settings-card"
import { driverEarnings, type PayTotal } from "@/lib/driver-format"
import type { DriverLoad } from "@/lib/drivers"
import { formatRate } from "@/lib/load-format"

const miles = new Intl.NumberFormat("en-US")
const count = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`

function Stat({ label, total }: { label: string; total: PayTotal }) {
  return (
    <div className="rounded-lg border bg-muted/30 px-4 py-3">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tracking-tight tabular-nums">
        {formatRate(total.pay)}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
        {count(total.loads, "load")} · {miles.format(total.miles)} mi
        {total.unpriced > 0 && ` · ${total.unpriced} without miles`}
      </p>
    </div>
  )
}

/**
 * What the driver has earned from delivered loads, at the rate locked on
 * each, and what's booked ahead. The weekly statement below adds
 * adjustments and reimbursements.
 */
export function DriverEarnings({
  loads,
  today,
}: {
  loads: DriverLoad[]
  /** "YYYY-MM-DD" */
  today: string
}) {
  const earned = driverEarnings(loads, today)
  return (
    <SettingsCard
      title="Earnings"
      description="Driver pay on delivered loads, at the rate locked on each. Adjustments and reimbursements are on the weekly statement."
      className="@container"
      contentClassName="grid grid-cols-2 gap-3 @2xl:grid-cols-4"
    >
      <Stat label="This week" total={earned.week} />
      <Stat label="This month" total={earned.month} />
      <Stat label="Year to date" total={earned.year} />
      <Stat label="Booked ahead" total={earned.ahead} />
    </SettingsCard>
  )
}
