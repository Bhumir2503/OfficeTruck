import type { Metadata } from "next"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"

import { TrailerForm } from "@/components/trailers/trailer-form"
import { buttonVariants } from "@/components/ui/button"
import { canManage, getOrganization } from "@/lib/organizations"
import { getTruckOptions } from "@/lib/trucks"

export const metadata: Metadata = { title: "Add trailer" }

export default async function NewTrailerPage({
  params,
}: PageProps<"/org/[slug]/trailers/new">) {
  const organization = await getOrganization((await params).slug)
  if (!organization) {
    notFound()
  }

  const base = `/org/${organization.slug}/trailers`
  // Members can't add trailers; the list doesn't offer it, so send them back.
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
          All trailers
        </Link>
        <TrailerForm
          organizationId={organization.id}
          base={base}
          trucks={await getTruckOptions(organization.id)}
        />
      </div>
    </div>
  )
}
