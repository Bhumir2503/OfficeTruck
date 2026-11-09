"use client"

import { useState } from "react"
import { cn } from "cn"
import Link from "next/link"
import { useRouter } from "next/navigation"

import { ForgotPasswordDialog } from "@/components/forgot-password-dialog"
import { GoogleAuthButton } from "@/components/google-auth-button"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { useZodForm } from "@/hooks/use-zod-form"
import { loginSchema } from "@/lib/schemas/auth"
import { createClient } from "@/lib/supabase/client"

export function LoginForm({
  className,
  linkError,
  ...props
}: React.ComponentProps<"div"> & { linkError?: string }) {
  const router = useRouter()
  const { errors, formError, pending, formProps } = useZodForm(
    loginSchema,
    async (credentials) => {
      const { error } =
        await createClient().auth.signInWithPassword(credentials)
      if (error) {
        return error.message
      }
      router.replace("/")
      router.refresh()
    }
  )
  const [forgotPasswordOpen, setForgotPasswordOpen] = useState(false)

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Welcome back</CardTitle>
          <CardDescription>
            Login with your email or Google account
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form {...formProps}>
            <FieldGroup>
              <Field data-invalid={!!errors.email}>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="m@example.com"
                  required
                  aria-invalid={!!errors.email}
                />
                <FieldError errors={errors.email} />
              </Field>
              <Field data-invalid={!!errors.password}>
                <div className="flex items-center">
                  <FieldLabel htmlFor="password">Password</FieldLabel>
                  <button
                    type="button"
                    className="ml-auto text-sm text-foreground underline-offset-4 hover:underline"
                    onClick={() => setForgotPasswordOpen(true)}
                  >
                    Forgot your password?
                  </button>
                </div>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  aria-invalid={!!errors.password}
                />
                <FieldError errors={errors.password} />
              </Field>
              <Field>
                <Button type="submit" disabled={pending}>
                  Login
                </Button>
                <FieldError className="text-center">
                  {formError ?? linkError}
                </FieldError>
              </Field>
              <FieldSeparator className="*:data-[slot=field-separator-content]:bg-card">
                Or continue with
              </FieldSeparator>
              <Field>
                <GoogleAuthButton>Login with Google</GoogleAuthButton>
                <FieldDescription className="text-center">
                  Don&apos;t have an account?{" "}
                  <Link href="/signup">Sign up</Link>
                </FieldDescription>
              </Field>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
      <FieldDescription className="px-6 text-center">
        By clicking continue, you agree to our <a href="#">Terms of Service</a>{" "}
        and <a href="#">Privacy Policy</a>.
      </FieldDescription>
      <ForgotPasswordDialog
        open={forgotPasswordOpen}
        onOpenChange={setForgotPasswordOpen}
      />
    </div>
  )
}
