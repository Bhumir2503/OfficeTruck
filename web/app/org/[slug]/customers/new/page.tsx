import type { Metadata } from "next"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { notFound } from "next/navigation"

import { BrokerForm } from "@/components/brokers/broker-form"
import { buttonVariants } from "@/components/ui/button"
import { getFactoringCompany } from "@/lib/factoring"
import { getOrganization } from "@/lib/organizations"

export const metadata: Metadata = { title: "Add customer" }

export default async function NewBrokerPage({
  params,
}: PageProps<"/org/[slug]/customers/new">) {
  const organization = await getOrganization((await params).slug)
  if (!organization) {
    notFound()
  }

  const base = `/org/${organization.slug}/customers`
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
          All customers
        </Link>
        <BrokerForm
          organizationId={organization.id}
          base={base}
          factoring={await getFactoringCompany(organization.id)}
          factoringHref={`/org/${organization.slug}/settings/factoring`}
        />
      </div>
    </div>
  )
}
