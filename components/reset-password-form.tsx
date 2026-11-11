"use client"

import { useRouter } from "next/navigation"

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
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { useZodForm } from "@/hooks/use-zod-form"
import { resetPasswordSchema } from "@/lib/schemas/auth"
import { createClient } from "@/lib/supabase/client"

export function ResetPasswordForm() {
  const router = useRouter()
  const { errors, formError, pending, formProps } = useZodForm(
    resetPasswordSchema,
    async ({ password }) => {
      const { error } = await createClient().auth.updateUser({ password })
      if (error) {
        return error.message
      }
      router.replace("/")
      router.refresh()
    }
  )

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-xl">Set a new password</CardTitle>
        <CardDescription>
          Choose a new password for your account
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form {...formProps}>
          <FieldGroup>
            <Field data-invalid={!!errors.password}>
              <FieldLabel htmlFor="password">New Password</FieldLabel>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                aria-invalid={!!errors.password}
              />
              <FieldError errors={errors.password} />
              {!errors.password && (
                <FieldDescription>
                  Must be at least 8 characters long.
                </FieldDescription>
              )}
            </Field>
            <Field data-invalid={!!errors.confirmPassword}>
              <FieldLabel htmlFor="confirm-password">
                Confirm New Password
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
            <Field>
              <Button type="submit" disabled={pending}>
                Update password
              </Button>
              <FieldError className="text-center">{formError}</FieldError>
            </Field>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  )
}
