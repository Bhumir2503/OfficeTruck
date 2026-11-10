import { LoginForm } from "@/components/login-form"
import { Logo } from "@/components/logo"

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <Logo className="self-center" />
        <LoginForm
          linkError={
            error === "link_invalid"
              ? "That link is invalid or has expired. Please request a new one."
              : undefined
          }
        />
      </div>
    </div>
  )
}
