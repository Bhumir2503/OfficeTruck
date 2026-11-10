import Link from "next/link"

import { Logo } from "@/components/logo"
import { buttonVariants } from "@/components/ui/button"
import { solutions } from "@/lib/solutions"
import { cn } from "@/lib/utils"

const navigation = [
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#features", label: "Features" },
  { href: "/#roadmap", label: "Roadmap" },
  { href: "/#pricing", label: "Pricing" },
]

export function SiteHeader() {
  return (
    <header className="flex items-center justify-between gap-4 p-6 md:px-10">
      <Logo className="-mr-3 -ml-4" />
      <nav
        aria-label="Main"
        className="hidden items-center gap-7 text-sm lg:flex"
      >
        {navigation.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <div className="flex items-center gap-1">
        <Link href="/login" className={buttonVariants({ variant: "ghost" })}>
          Login
        </Link>
        <Link
          href="/signup"
          className={cn(buttonVariants(), "hidden sm:inline-flex")}
        >
          Sign up
        </Link>
      </div>
    </header>
  )
}

export function SiteFooter() {
  return (
    <footer className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-10 text-sm text-muted-foreground">
      <nav
        aria-label="Solutions"
        className="flex flex-wrap gap-x-6 gap-y-2 text-foreground"
      >
        {solutions.map((solution) => (
          <Link
            key={solution.slug}
            href={`/solutions/${solution.slug}`}
            className="underline-offset-4 hover:underline"
          >
            {solution.name}
          </Link>
        ))}
      </nav>
      <div className="flex flex-col justify-between gap-2 sm:flex-row">
        <p>OfficeTruck. Your trucking business. One office.</p>
        <p>&copy; {new Date().getFullYear()} OfficeTruck</p>
      </div>
    </footer>
  )
}
