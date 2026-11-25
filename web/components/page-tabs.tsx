"use client"

import { cn } from "cn"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { createContext, use, useState, useTransition } from "react"

/*
 * Tabs on a record's page (a driver, a truck, a load), each its own address
 * (?tab=...). Changing only the query doesn't show the route's loading.tsx,
 * so these show the clicked tab's skeleton themselves until it arrives.
 * The bar and the panel can sit apart in the layout; the provider ties them.
 */

export type PageTab = {
  key: string
  label: string
  href: string
}

const Pending = createContext<{
  /** The tab being opened, while it loads. */
  loading: string | null
  open: (key: string, href: string) => void
}>({ loading: null, open: () => {} })

/** Wraps the bar and the panel so the panel knows what's loading. */
export function PageTabsProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [target, setTarget] = useState<string | null>(null)

  function open(key: string, href: string) {
    setTarget(key)
    start(() => router.push(href, { scroll: false }))
  }

  return (
    <Pending value={{ loading: pending ? target : null, open }}>
      {children}
    </Pending>
  )
}

/**
 * The row of tabs, styled like the app's other tabs. On a phone it scrolls
 * sideways rather than widening the page.
 */
export function PageTabBar({
  tabs,
  active,
  label,
}: {
  tabs: PageTab[]
  active: string
  /** Names the row for screen readers, e.g. "Driver sections". */
  label: string
}) {
  const { loading, open } = use(Pending)
  const shown = loading ?? active
  return (
    <div className="-mx-4 overflow-x-auto px-4 lg:mx-0 lg:px-0">
      <nav
        aria-label={label}
        className="inline-flex h-9 w-max items-center rounded-lg bg-muted p-[3px] text-muted-foreground"
      >
        {tabs.map((tab) => {
          const current = tab.key === shown
          return (
            <Link
              key={tab.key}
              href={tab.href}
              scroll={false}
              aria-current={tab.key === active ? "page" : undefined}
              onClick={(event) => {
                // A new browser tab or window opens as usual.
                if (
                  event.metaKey ||
                  event.ctrlKey ||
                  event.shiftKey ||
                  event.altKey ||
                  event.button !== 0
                ) {
                  return
                }
                event.preventDefault()
                if (tab.key !== active || loading) open(tab.key, tab.href)
              }}
              className={cn(
                "inline-flex h-full items-center rounded-md px-3 text-sm font-medium whitespace-nowrap transition-all hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
                current
                  ? "bg-background text-foreground shadow-sm dark:bg-input/30"
                  : "text-foreground/60 dark:text-muted-foreground"
              )}
            >
              {tab.label}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}

/**
 * The active tab's content, or the skeleton of the tab being opened while
 * it loads.
 */
export function PageTabPanel({
  active,
  skeletons,
  className,
  children,
}: {
  active: string
  /** Each tab's loading skeleton, by key. */
  skeletons: Record<string, React.ReactNode>
  className?: string
  children: React.ReactNode
}) {
  const { loading } = use(Pending)
  const showing = loading && loading !== active ? loading : null
  return (
    <div className={className} aria-busy={showing ? true : undefined}>
      {showing ? skeletons[showing] : children}
    </div>
  )
}
