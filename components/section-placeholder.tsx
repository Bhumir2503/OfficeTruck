import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { findSection } from "@/lib/org-nav"

export function sectionMetadata(path: string): Metadata {
  return { title: findSection(path)?.title }
}

/** Stand-in for sections that haven't been built yet. */
export function SectionPlaceholder({ path }: { path: string }) {
  const section = findSection(path)
  if (!section) {
    notFound()
  }

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="flex max-w-md flex-col items-center gap-3 text-center">
        <div className="flex size-12 items-center justify-center rounded-xl bg-muted">
          <section.icon className="size-6 text-muted-foreground" />
        </div>
        <h2 className="text-xl font-semibold tracking-tight">
          {section.title}
        </h2>
        <p className="text-balance text-muted-foreground">
          {section.description}
        </p>
        <p className="text-sm text-muted-foreground">Coming soon.</p>
      </div>
    </div>
  )
}
