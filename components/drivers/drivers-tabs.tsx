"use client"

import { cn } from "cn"
import Link from "next/link"
import { usePathname } from "next/navigation"

/** Drivers and their pay, as two tabs of the Drivers section. */
export function DriversTabs({
  base,
  showPay,
}: {
  /** /org/<slug>/drivers */
  base: string
  /** Pay is for owners and admins only. */
  showPay: boolean
}) {
  const pathname = usePathname()
  if (!showPay) return null
  const onPay = pathname.startsWith(`${base}/pay`)
  const tabs = [
    { title: "Drivers", href: base, active: !onPay },
    { title: "Pay", href: `${base}/pay`, active: onPay },
  ]
  return (
    <nav
      aria-label="Drivers"
      className="inline-flex w-fit items-center rounded-lg bg-muted p-[3px] text-sm"
    >
      {tabs.map((tab) => (
        <Link
          key={tab.title}
          href={tab.href}
          aria-current={tab.active ? "page" : undefined}
          className={cn(
            "rounded-md px-3 py-1 font-medium text-foreground/60 transition-colors hover:text-foreground",
            tab.active && "bg-background text-foreground shadow-sm"
          )}
        >
          {tab.title}
        </Link>
      ))}
    </nav>
  )
}
