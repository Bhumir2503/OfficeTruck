import { Logo } from "@/components/logo"
import { SignupForm } from "@/components/signup-form"
import { safeNext } from "@/lib/safe-next"

export default async function SignupPage({
  searchParams,
}: PageProps<"/signup">) {
  const { next, email } = await searchParams

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <Logo className="self-center" />
        <SignupForm
          next={safeNext(typeof next === "string" ? next : null) ?? undefined}
          defaultEmail={typeof email === "string" ? email : undefined}
        />
      </div>
    </div>
  )
}
