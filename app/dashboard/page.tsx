import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { Logo } from "@/components/logo"
import { SignOutButton } from "@/components/sign-out-button"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = {
  title: "Dashboard | OfficeTruck",
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()

  if (!data?.claims) {
    redirect("/login")
  }

  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex items-center justify-between gap-4 p-6 md:px-10">
        <Logo className="-mr-3 -ml-4" />
        <SignOutButton />
      </header>
      <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 pb-24 text-center">
        <h1 className="text-4xl font-semibold tracking-tight text-balance md:text-5xl">
          Welcome to OfficeTruck
        </h1>
        <p className="max-w-md text-balance text-muted-foreground md:text-lg">
          You&apos;re signed in as {data.claims.email}.
        </p>
      </main>
    </div>
  )
}
