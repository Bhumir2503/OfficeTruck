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

export const metadata: Metadata = {
  title: "OfficeTruck | Your trucking business. One office.",
  description:
    "Loads, drivers, paperwork, invoices and cash flow in one connected place, built for owner-operators and fleets of 1 to 20 trucks.",
}

export default function Page() {
  return (
    <div className="flex min-h-svh flex-col">
      <SiteHeader />
      <main className="flex-1">
        <Hero />
        <Problem />
        <HowItWorks />
        <Features />
        <Control />
        <Roadmap />
        <Pricing />
        <Solutions />
        <Faq />
        <FinalCta />
      </main>
      <SiteFooter />
    </div>
  )
}
