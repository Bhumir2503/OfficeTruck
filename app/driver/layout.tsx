import type { Metadata } from "next"

import { DriverSignOut } from "@/components/dq/driver-sign-out"
import { Logo } from "@/components/logo"

export const metadata: Metadata = {
  title: { default: "Your driver file", template: "%s | OfficeTruck" },
}

/** The driver's side, sized for a phone: their own file and nothing else. */
export default function DriverLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-svh bg-muted/40">
      <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b bg-background px-4">
        <Logo />
        <DriverSignOut />
      </header>
      <main className="mx-auto w-full max-w-lg px-4 py-6">{children}</main>
    </div>
  )
}
