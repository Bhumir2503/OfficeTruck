import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { PayWeek } from "@/components/pay/pay-week"
import { SettingsEmptyState } from "@/components/settings/settings-card"
import { today } from "@/lib/driver-format"
import { canManage, getOrganization } from "@/lib/organizations"
import { parseWeek, shiftWeek, weekOf } from "@/lib/settlement-format"
import { getPayWeek } from "@/lib/settlements"
import { LockIcon } from "lucide-react"

export const metadata: Metadata = { title: "Driver pay" }

export default async function PayPage({
  params,
  searchParams,
}: PageProps<"/org/[slug]/pay">) {
  const organization = await getOrganization((await params).slug)
  if (!organization) {
    notFound()
  }
  if (!canManage(organization)) {
    return (
      <div className="px-4 py-6 lg:px-6 lg:py-8">
        <SettingsEmptyState icon={LockIcon} title="Owners and admins only">
          Driver pay is private. Ask an owner or admin if you need it.
        </SettingsEmptyState>
      </div>
    )
  }

  const thisWeek = weekOf(today())
  // Payroll usually covers the last full week.
  const week = parseWeek((await searchParams).week) ?? shiftWeek(thisWeek, -1)
  const settlements = await getPayWeek(organization.id, week)

  return (
    <div className="px-4 py-6 lg:px-6 lg:py-8">
      <PayWeek
        settlements={settlements}
        week={week}
        thisWeek={thisWeek}
        base={`/org/${organization.slug}/pay`}
      />
    </div>
  )
}
