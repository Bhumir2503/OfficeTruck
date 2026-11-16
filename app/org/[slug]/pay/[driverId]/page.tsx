import { ChevronLeft } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { SettlementStatus } from "@/components/pay/pay-week"
import { SettlementView } from "@/components/pay/settlement-view"
import { buttonVariants } from "@/components/ui/button"
import { today } from "@/lib/driver-format"
import { canManage, getOrganization } from "@/lib/organizations"
import { parseWeek, shiftWeek, weekOf } from "@/lib/settlement-format"
import { getSettlement } from "@/lib/settlements"

export const metadata: Metadata = { title: "Driver pay" }

export default async function SettlementPage({
  params,
  searchParams,
}: PageProps<"/org/[slug]/pay/[driverId]">) {
  const { slug, driverId } = await params
  const organization = await getOrganization(slug)
  if (!organization || !canManage(organization)) {
    notFound()
  }
  const week =
    parseWeek((await searchParams).week) ?? shiftWeek(weekOf(today()), -1)
  const settlement = await getSettlement(organization.id, driverId, week)
  if (!settlement) {
    notFound()
  }
  const base = `/org/${organization.slug}`

  return (
    <div className="px-4 py-6 lg:px-6 lg:py-8">
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href={`${base}/pay?week=${week}`}
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            <ChevronLeft />
            All drivers
          </Link>
          <Link
            href={`${base}/drivers/${settlement.driver.id}`}
            className="text-lg font-semibold tracking-tight hover:underline"
          >
            {settlement.driver.full_name}
          </Link>
          <SettlementStatus settlement={settlement} />
        </div>
        <SettlementView
          organizationId={organization.id}
          settlement={settlement}
          today={today()}
          loadsBase={`${base}/loads`}
        />
      </div>
    </div>
  )
}
