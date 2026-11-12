import { ChevronRightIcon } from "lucide-react"
import Link from "next/link"

import { OrganizationAvatar } from "@/components/organization-avatar"
import { SettingsCard } from "@/components/settings/settings-card"
import { Badge } from "@/components/ui/badge"
import type { Organization } from "@/lib/organizations"

const ROLE_LABELS = { owner: "Owner", admin: "Admin", member: "Member" }

/** The organizations the user belongs to, with their role in each. */
export function AccountOrganizations({
  organizations,
  currentSlug,
}: {
  organizations: Organization[]
  currentSlug: string
}) {
  return (
    <SettingsCard
      title="Organizations"
      description="Every organization you're a member of, and your role in it."
      contentClassName="px-0 pb-0"
    >
      <ul className="divide-y border-t">
        {organizations.map((organization) => (
          <li key={organization.id}>
            <Link
              href={`/org/${organization.slug}`}
              className="group flex items-center gap-3 px-6 py-3 transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none"
            >
              <OrganizationAvatar name={organization.name} className="size-8" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {organization.name}
                </p>
                <p className="truncate text-sm text-muted-foreground">
                  /org/{organization.slug}
                </p>
              </div>
              {organization.slug === currentSlug && (
                <span className="hidden text-xs text-muted-foreground sm:inline">
                  Current
                </span>
              )}
              <Badge
                variant={
                  organization.role === "owner" ? "default" : "secondary"
                }
              >
                {ROLE_LABELS[organization.role]}
              </Badge>
              <ChevronRightIcon className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </Link>
          </li>
        ))}
      </ul>
    </SettingsCard>
  )
}
