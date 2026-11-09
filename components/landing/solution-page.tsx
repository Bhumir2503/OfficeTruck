import { ArrowRightIcon } from "lucide-react"
import Link from "next/link"

import {
  container,
  deepPanel,
  Faq,
  FinalCta,
  GetStarted,
} from "@/components/landing/landing-sections"
import { solutions, type Solution } from "@/lib/solutions"
import { cn } from "@/lib/utils"

const toneClass = {
  good: "text-primary",
  warn: "rounded bg-[#f4b740] px-1.5 py-0.5 text-neutral-950",
  bad: "text-destructive",
}

function ExampleCard({ example }: { example: Solution["example"] }) {
  return (
    <div className="rounded-2xl bg-card p-5 text-card-foreground shadow-2xl ring-1 shadow-black/30 ring-black/5 sm:p-6">
      <div className="flex items-center justify-between gap-4">
        <p className="font-medium">{example.title}</p>
        <p className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
          Example
        </p>
      </div>
      <ul className="mt-3 divide-y">
        {example.rows.map((row) => (
          <li
            key={row.label}
            className="flex items-center justify-between gap-4 py-3"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium">{row.label}</p>
              <p className="text-sm text-muted-foreground">{row.detail}</p>
            </div>
            <p
              className={cn(
                "shrink-0 font-mono text-sm",
                row.tone && toneClass[row.tone]
              )}
            >
              {row.value}
            </p>
          </li>
        ))}
      </ul>
      <dl className="mt-3 grid grid-cols-3 gap-px overflow-hidden rounded-lg border bg-border">
        {example.totals.map((total) => (
          <div key={total.label} className="bg-card p-3">
            <dt className="text-xs text-muted-foreground">{total.label}</dt>
            <dd className="mt-0.5 font-mono text-base font-medium sm:text-lg">
              {total.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

export function SolutionPage({
  solution,
  signedIn,
}: {
  solution: Solution
  signedIn: boolean
}) {
  const related = solutions.filter((item) => item.slug !== solution.slug)

  return (
    <>
      <section className="px-3 sm:px-4">
        <div
          className={cn(
            "mx-auto max-w-[1400px] overflow-hidden rounded-3xl text-primary-foreground",
            deepPanel
          )}
        >
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 py-14 sm:py-20 lg:grid-cols-[1.1fr_minmax(0,0.9fr)]">
            <div>
              <p className="text-sm font-medium text-[#f4b740]">
                {solution.eyebrow}
              </p>
              <h1 className="mt-4 text-4xl leading-[1.05] font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl">
                {solution.headline}
              </h1>
              <p className="mt-6 max-w-lg text-lg text-pretty text-primary-foreground/80">
                {solution.lead}
              </p>
              {!signedIn && (
                <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
                  <GetStarted />
                  <p className="text-sm text-primary-foreground/80">
                    Now recruiting pilot carriers
                  </p>
                </div>
              )}
            </div>
            <ExampleCard example={solution.example} />
          </div>
        </div>
      </section>

      <section className={cn(container, "py-20 sm:py-28")}>
        <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
          <h2 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            {solution.painsHeading}
          </h2>
          <ul className="divide-y border-y">
            {solution.pains.map((pain) => (
              <li key={pain.title} className="py-5">
                <h3 className="font-medium">{pain.title}</h3>
                <p className="mt-1 text-muted-foreground">{pain.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="bg-muted py-20 sm:py-28">
        <div className={container}>
          <h2 className="max-w-2xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            {solution.featuresHeading}
          </h2>
          <ul className="mt-12 grid gap-x-12 sm:grid-cols-2 lg:grid-cols-3">
            {solution.features.map((feature) => (
              <li
                key={feature.title}
                className="border-t border-foreground/15 py-6"
              >
                <h3 className="font-medium">{feature.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {feature.body}
                </p>
                {feature.later && (
                  <p className="mt-3 inline-block rounded-full bg-background px-2.5 py-1 text-xs text-muted-foreground">
                    Later on the roadmap
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className={cn(container, "pt-20 sm:pt-28")}>
        <div className="border-l-4 border-primary pl-6 sm:pl-8">
          <h2 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            {solution.callout.heading}
          </h2>
          <p className="mt-3 max-w-2xl text-lg text-muted-foreground">
            {solution.callout.body}
          </p>
        </div>
      </section>

      <Faq items={solution.faq} />

      <section className={cn(container, "pb-20 sm:pb-28")}>
        <h2 className="text-lg font-semibold tracking-tight">
          More from OfficeTruck
        </h2>
        <ul className="mt-4 grid gap-px overflow-hidden rounded-2xl border bg-border sm:grid-cols-2 lg:grid-cols-4">
          {related.map((item) => (
            <li key={item.slug} className="bg-background">
              <Link
                href={`/solutions/${item.slug}`}
                className="group flex h-full flex-col p-5 transition-colors hover:bg-muted"
              >
                <span className="flex items-center justify-between gap-2 font-medium">
                  {item.name}
                  <ArrowRightIcon className="size-4 text-primary transition-transform group-hover:translate-x-1" />
                </span>
                <span className="mt-1 text-sm text-muted-foreground">
                  {item.summary}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {!signedIn && <FinalCta />}
    </>
  )
}
