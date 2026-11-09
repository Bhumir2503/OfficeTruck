import type { Metadata } from "next"

import {
  Control,
  Faq,
  Features,
  FinalCta,
  Hero,
  HowItWorks,
  Pricing,
  Problem,
  Roadmap,
  Solutions,
} from "@/components/landing/landing-sections"
import { SiteFooter, SiteHeader } from "@/components/landing/site-chrome"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = {
  title: "OfficeTruck | Your trucking business. One office.",
  description:
    "Loads, drivers, paperwork, invoices and cash flow in one connected place, built for owner-operators and fleets of 1 to 20 trucks.",
}

export default async function Page() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  const claims = data?.claims
  const signedIn = !!claims

  return (
    <div className="flex min-h-svh flex-col">
      <SiteHeader signedIn={signedIn} />
      <main className="flex-1">
        <Hero email={claims?.email} />
        <Problem />
        <HowItWorks />
        <Features />
        <Control />
        <Roadmap />
        <Pricing signedIn={signedIn} />
        <Solutions />
        <Faq />
        {!signedIn && <FinalCta />}
      </main>
      <SiteFooter />
    </div>
  )
}
