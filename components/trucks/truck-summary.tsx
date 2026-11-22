import Link from "next/link"

import { ExpiryDate } from "@/components/drivers/driver-badges"
import { SettingsCard } from "@/components/settings/settings-card"
import { type ComplianceItem, formatDate } from "@/lib/driver-format"
import { formatRate } from "@/lib/load-format"
import { OWNERSHIP_LABELS } from "@/lib/schemas/truck"
import { monthlyFixedCosts } from "@/lib/truck-format"
import type { Truck } from "@/lib/trucks"

const thousands = new Intl.NumberFormat("en-US")

function Detail({
  label,
  className,
  children,
}: {
  label: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={className}>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm font-medium">{children}</dd>
    </div>
  )
}

/**
 * Everything on file for a truck, read-only, for members who can't edit it:
 * its dates, specs, ownership and driver, odometer and service schedule.
 */
export function TruckSummary({
  truck,
  items,
  warn,
  driversBase,
}: {
  truck: Truck
  items: ComplianceItem[]
  warn: boolean
  /** /org/<slug>/drivers */
  driversBase: string
}) {
  const none = <span className="text-muted-foreground">Not set</span>
  const monthly = monthlyFixedCosts(truck)
  const pm = [
    truck.pm_interval_miles &&
      `${thousands.format(truck.pm_interval_miles)} miles`,
    truck.pm_interval_days && `${truck.pm_interval_days} days`,
  ].filter(Boolean)

  return (
    <SettingsCard title="Truck details">
      <dl className="grid gap-5 sm:grid-cols-3">
        {items.map((item) => (
          <Detail
            key={item.key}
            label={
              item.kind === "expires"
                ? `${item.label} expires`
                : `${item.label} due`
            }
          >
            <ExpiryDate item={item} warn={warn} />
            {item.kind === "due" && item.last && (
              <span className="mt-0.5 block font-normal text-muted-foreground">
                Last done {formatDate(item.last)}
              </span>
            )}
          </Detail>
        ))}
        <Detail label="Plate">
          {truck.plate_number
            ? `${truck.plate_number}${truck.plate_state ? ` · ${truck.plate_state}` : ""}`
            : none}
        </Detail>
        <Detail label="Registered weight">
          {truck.registered_weight_lbs
            ? `${thousands.format(truck.registered_weight_lbs)} lbs${truck.axles ? ` · ${truck.axles} axles` : ""}`
            : none}
        </Detail>
        <Detail label="Ownership">
          {truck.ownership ? OWNERSHIP_LABELS[truck.ownership] : none}
        </Detail>
        <Detail label="Default driver">
          {truck.default_driver ? (
            <Link
              href={`${driversBase}/${truck.default_driver.id}`}
              className="hover:underline"
            >
              {truck.default_driver.full_name}
            </Link>
          ) : (
            none
          )}
        </Detail>
        <Detail label="Odometer">
          {truck.odometer !== null ? (
            <>
              {thousands.format(truck.odometer)} mi
              {truck.odometer_on && (
                <span className="mt-0.5 block font-normal text-muted-foreground">
                  Read {formatDate(truck.odometer_on)}
                </span>
              )}
            </>
          ) : (
            none
          )}
        </Detail>
        <Detail label="Service every">
          {pm.length ? pm.join(" or ") : none}
        </Detail>
        <Detail label="Fixed costs">
          {monthly > 0 ? `${formatRate(monthly)} / month` : none}
        </Detail>
        {truck.home_base && (
          <Detail label="Home base" className="sm:col-span-3">
            {truck.home_base}
          </Detail>
        )}
      </dl>
    </SettingsCard>
  )
}
