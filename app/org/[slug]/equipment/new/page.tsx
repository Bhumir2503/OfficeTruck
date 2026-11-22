import type { Metadata } from "next"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"

import { TruckForm } from "@/components/trucks/truck-form"
import { buttonVariants } from "@/components/ui/button"
import { getDriverOptions } from "@/lib/drivers"
import { canManage, getOrganization } from "@/lib/organizations"

export const metadata: Metadata = { title: "Add truck" }

export default async function NewTruckPage({
  params,
}: PageProps<"/org/[slug]/equipment/new">) {
  const organization = await getOrganization((await params).slug)
  if (!organization) {
    notFound()
  }

  const base = `/org/${organization.slug}/equipment`
  // Members can't add trucks; the list doesn't offer it, so send them back.
  if (!canManage(organization)) {
    redirect(base)
  }

  return (
    <div className="px-4 py-6 lg:px-6 lg:py-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <Link
          href={base}
          className={buttonVariants({
            variant: "ghost",
            size: "sm",
            className: "-ml-2 w-fit",
          })}
        >
          <ArrowLeft />
          All trucks
        </Link>
        <TruckForm
          organizationId={organization.id}
          base={base}
          drivers={await getDriverOptions(organization.id)}
        />
      </div>
    </div>
  )
}
