import { ArrowRight, CalendarClock, Plus } from "lucide-react"
import Link from "next/link"

import { DriverStatusButton } from "@/components/drivers/driver-status-button"
import { buttonVariants } from "@/components/ui/button"
import {
  DRIVER_CARD_IDS,
  driverNextSteps,
  type ComplianceItem,
} from "@/lib/driver-format"
import type { Driver, DriverLoad } from "@/lib/drivers"

/** Where the driver page's Documents card is. */
export const DRIVER_DOCUMENTS_ID = "documents"

/**
 * The right-hand side of the driver page: the one thing to do about them
 * now.
 */
export function DriverSidePanel({
  organizationId,
  driver,
  items,
  loads,
  manager,
  loadsBase,
  documentKinds = [],
}: {
  organizationId: string
  driver: Driver
  items: ComplianceItem[]
  loads: DriverLoad[]
  manager: boolean
  /** /org/<slug>/loads */
  loadsBase: string
  /** Kinds of document on file, e.g. "cdl", "medical_card". */
  documentKinds?: readonly string[]
}) {
  const step = driverNextSteps(
    { ...driver, documents: documentKinds },
    items,
    loads
  )[0]!
  const action = step.action
  return (
    <div className="flex flex-col gap-4">
      {/* Next action */}
      <section className="overflow-hidden rounded-xl border bg-card text-card-foreground shadow-xs">
        <div className="px-5 pt-4 pb-5">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Next action
          </p>
          <h4 className="mt-1 text-lg font-semibold tracking-tight">
            {step.title}
          </h4>
          <p className="mt-1 text-sm text-muted-foreground">{step.detail}</p>
          {action?.type === "load" && (
            <Link
              href={`${loadsBase}/${action.id}`}
              className={buttonVariants({
                size: "lg",
                className: "mt-4 w-full",
              })}
            >
              Open load {action.reference} <ArrowRight />
            </Link>
          )}
          {action?.type === "new_load" && manager && (
            <Link
              href={`${loadsBase}/new`}
              className={buttonVariants({
                size: "lg",
                className: "mt-4 w-full",
              })}
            >
              <Plus /> New load
            </Link>
          )}
          {action?.type === "edit" && manager && (
            <a
              href={`#${DRIVER_CARD_IDS[action.target]}`}
              className={buttonVariants({
                size: "lg",
                className: "mt-4 w-full",
              })}
            >
              <CalendarClock /> {action.label}
            </a>
          )}
          {action?.type === "activate" && manager && (
            <div className="mt-4">
              <DriverStatusButton
                organizationId={organizationId}
                driver={{
                  id: driver.id,
                  full_name: driver.full_name,
                  status: driver.status,
                }}
              />
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
