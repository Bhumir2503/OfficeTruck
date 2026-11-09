import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { SiteFooter, SiteHeader } from "@/components/landing/site-chrome"
import { SolutionPage } from "@/components/landing/solution-page"
import { solutions } from "@/lib/solutions"
import { createClient } from "@/lib/supabase/server"

type Props = { params: Promise<{ slug: string }> }

function findSolution(slug: string) {
  return solutions.find((solution) => solution.slug === slug)
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const solution = findSolution((await params).slug)

  return solution
    ? { title: solution.metaTitle, description: solution.metaDescription }
    : {}
}

export default async function Page({ params }: Props) {
  const solution = findSolution((await params).slug)
  if (!solution) {
    notFound()
  }

  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  const signedIn = !!data?.claims

  return (
    <div className="flex min-h-svh flex-col">
      <SiteHeader signedIn={signedIn} />
      <main className="flex-1">
        <SolutionPage solution={solution} signedIn={signedIn} />
      </main>
      <SiteFooter />
    </div>
  )
}
