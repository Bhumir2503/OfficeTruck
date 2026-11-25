import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { TrailersTable } from "@/components/trailers/trailers-table"
import { today } from "@/lib/driver-format"
import { canManage, getOrganization } from "@/lib/organizations"
import { getTrailers } from "@/lib/trailers"

export const metadata: Metadata = { title: "Trailers" }

export default async function TrailersPage({
  params,
}: PageProps<"/org/[slug]/trailers">) {
  const organization = await getOrganization((await params).slug)
  if (!organization) {
    notFound()
  }

  return (
    <div className="px-4 py-6 lg:px-6 lg:py-8">
      <TrailersTable
        trailers={await getTrailers(organization.id)}
        base={`/org/${organization.slug}/trailers`}
        trucksBase={`/org/${organization.slug}/equipment`}
        today={today()}
        canManage={canManage(organization)}
      />
    </div>
  )
}
