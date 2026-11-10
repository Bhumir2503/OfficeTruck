import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { SiteFooter, SiteHeader } from "@/components/landing/site-chrome"
import { SolutionPage } from "@/components/landing/solution-page"
import { solutions } from "@/lib/solutions"

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

  return (
    <div className="flex min-h-svh flex-col">
      <SiteHeader />
      <main className="flex-1">
        <SolutionPage solution={solution} />
      </main>
      <SiteFooter />
    </div>
  )
}
