import { ChevronRight } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"

import { CreateOrganizationDialog } from "@/components/create-organization-dialog"
import { Logo } from "@/components/logo"
import { OrganizationAvatar } from "@/components/organization-avatar"
import { SignOutButton } from "@/components/sign-out-button"
import { Card } from "@/components/ui/card"
import { getMyOrganizations, getUser } from "@/lib/organizations"

export const metadata: Metadata = {
  title: "Organizations | OfficeTruck",
}

export default async function OrganizationPickerPage() {
  if (!(await getUser())) {
    redirect("/login")
  }

  const organizations = await getMyOrganizations()

  return (
    <div className="flex min-h-svh flex-col bg-muted">
      <header className="flex items-center justify-between gap-4 p-6 md:px-10">
        <Logo className="-mr-3 -ml-4" />
        <SignOutButton />
      </header>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-6 pt-6 pb-24 md:pt-16">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            {organizations.length
              ? "Choose an organization"
              : "Create your organization"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {organizations.length
              ? "Pick where you want to work, or create a new organization."
              : "You aren't part of an organization yet. Create one to get started."}
          </p>
        </div>

        {organizations.length > 0 && (
          <Card className="gap-0 py-0">
            <ul className="divide-y">
              {organizations.map((org) => (
                <li key={org.id}>
                  <Link
                    href={`/org/${org.slug}`}
                    className="flex items-center gap-3 px-4 py-3 transition-colors outline-none first:rounded-t-xl hover:bg-muted/60 focus-visible:bg-muted/60"
                  >
                    <OrganizationAvatar name={org.name} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{org.name}</div>
                      <div className="truncate text-sm text-muted-foreground">
                        /org/{org.slug}
                      </div>
                    </div>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}

        <CreateOrganizationDialog />
      </main>
    </div>
  )
}
