"use client"

import { useState } from "react"
import { cn } from "cn"
import Link from "next/link"
import { useRouter } from "next/navigation"

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
import { signupSchema } from "@/lib/schemas/auth"
import { authRedirectUrl, createClient } from "@/lib/supabase/client"

export function SignupForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const router = useRouter()
  const [confirmationSent, setConfirmationSent] = useState(false)
  const { errors, formError, pending, formProps } = useZodForm(
    signupSchema,
    async ({ name, email, password }) => {
      setConfirmationSent(false)
      const { data, error } = await createClient().auth.signUp({
        email,
        password,
        options: {
          data: { full_name: name },
          emailRedirectTo: authRedirectUrl(),
        },
      })
      if (error) {
        return error.message
      }
      // No session means the project requires email confirmation first.
      if (!data.session) {
        setConfirmationSent(true)
        return
      }
      router.replace("/dashboard")
      router.refresh()
    }
  )

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Create your account</CardTitle>
          <CardDescription>
            Enter your email below to create your account
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form {...formProps}>
            <FieldGroup>
              <Field data-invalid={!!errors.name}>
                <FieldLabel htmlFor="name">Full Name</FieldLabel>
                <Input
                  id="name"
                  name="name"
                  type="text"
                  autoComplete="name"
                  placeholder="John Doe"
                  required
                  aria-invalid={!!errors.name}
                />
                <FieldError errors={errors.name} />
              </Field>
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
              <Field>
                <Field className="grid grid-cols-2 items-start gap-4">
                  <Field data-invalid={!!errors.password}>
                    <FieldLabel htmlFor="password">Password</FieldLabel>
                    <Input
                      id="password"
                      name="password"
                      type="password"
                      autoComplete="new-password"
                      required
                      aria-invalid={!!errors.password}
                    />
                    <FieldError errors={errors.password} />
                  </Field>
                  <Field data-invalid={!!errors.confirmPassword}>
                    <FieldLabel htmlFor="confirm-password">
                      Confirm Password
                    </FieldLabel>
                    <Input
                      id="confirm-password"
                      name="confirmPassword"
                      type="password"
                      autoComplete="new-password"
                      required
                      aria-invalid={!!errors.confirmPassword}
                    />
                    <FieldError errors={errors.confirmPassword} />
                  </Field>
                </Field>
                {!errors.password && (
                  <FieldDescription>
                    Must be at least 8 characters long.
                  </FieldDescription>
                )}
              </Field>
              <Field>
                <Button type="submit" disabled={pending}>
                  Create Account
                </Button>
                <FieldError className="text-center">{formError}</FieldError>
                {confirmationSent && (
                  <FieldDescription role="status" className="text-center">
                    Check your email for a link to confirm your account.
                  </FieldDescription>
                )}
              </Field>
              <FieldSeparator className="*:data-[slot=field-separator-content]:bg-card">
                Or continue with
              </FieldSeparator>
              <Field>
                <GoogleAuthButton>Sign up with Google</GoogleAuthButton>
                <FieldDescription className="text-center">
                  Already have an account? <Link href="/login">Sign in</Link>
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
    </div>
  )
}
