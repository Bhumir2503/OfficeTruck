import type { Metadata } from "next"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { notFound } from "next/navigation"

import { RateConInbox } from "@/components/loads/rate-con-inbox"
import { buttonVariants } from "@/components/ui/button"
import { getOrganization } from "@/lib/organizations"
import { getInboxAddress, getInboxItems } from "@/lib/rate-con-inbox-data"

export const metadata: Metadata = { title: "Rate con inbox" }

export default async function RateConInboxPage({
  params,
}: PageProps<"/org/[slug]/loads/inbox">) {
  const organization = await getOrganization((await params).slug)
  if (!organization) {
    notFound()
  }
  const base = `/org/${organization.slug}/loads`
  const [items, { address, domainSet }] = await Promise.all([
    getInboxItems(organization.id),
    getInboxAddress(organization.id),
  ])

  return (
    <div className="px-4 py-6 lg:px-6 lg:py-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <Link
          href={base}
          className={buttonVariants({
            variant: "ghost",
            size: "sm",
            className: "-ml-2 w-fit",
          })}
        >
          <ArrowLeft />
          All loads
        </Link>
        <RateConInbox
          organizationId={organization.id}
          items={items}
          address={address}
          domainSet={domainSet}
          loadsBase={base}
        />
      </div>
    </div>
  )
}
