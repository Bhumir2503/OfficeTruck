import Link from "next/link"

import { Logo } from "@/components/logo"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export default function Page() {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex items-center justify-between p-6 md:px-10">
        <Logo className="-mr-3 -ml-4" />
        {/* mr-11 leaves room for the theme toggle from the root layout. */}
        <Link
          href="/login"
          className={cn(buttonVariants({ variant: "ghost" }), "mr-11")}
        >
          Login
        </Link>
      </header>
      <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 pb-24 text-center">
        <h1 className="text-4xl font-bold tracking-tight text-balance md:text-6xl">
          Welcome to OfficeTruck
        </h1>
        <p className="max-w-md text-balance text-muted-foreground md:text-lg">
          Login to your account or create a new one to get started.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link
            href="/signup"
            className={cn(buttonVariants({ size: "lg" }), "px-6")}
          >
            Sign up
          </Link>
          <Link
            href="/login"
            className={cn(
              buttonVariants({ size: "lg", variant: "outline" }),
              "px-6"
            )}
          >
            Login
          </Link>
        </div>
      </main>
    </div>
  )
}
