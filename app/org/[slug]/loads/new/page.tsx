import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { NewLoadForm } from "@/components/loads/new-load-form"
import { getOrganization } from "@/lib/organizations"

export const metadata: Metadata = { title: "New load" }

export default async function NewLoadPage({
  params,
}: PageProps<"/org/[slug]/loads/new">) {
  const organization = await getOrganization((await params).slug)
  if (!organization) {
    notFound()
  }

  return (
    <div className="px-4 py-6 lg:px-6 lg:py-8">
      <div className="mx-auto max-w-3xl">
        <NewLoadForm
          organizationId={organization.id}
          base={`/org/${organization.slug}/loads`}
        />
      </div>
    </div>
  )
}
