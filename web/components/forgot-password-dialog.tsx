"use client"

import { useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { useZodForm } from "@/hooks/use-zod-form"
import { forgotPasswordSchema } from "@/lib/schemas/auth"
import { authRedirectUrl, createClient } from "@/lib/supabase/client"

// Lives inside the dialog content so its state resets each time it closes.
function ForgotPasswordForm() {
  const [sent, setSent] = useState(false)
  const { errors, formError, pending, formProps } = useZodForm(
    forgotPasswordSchema,
    async ({ email }) => {
      setSent(false)
      const { error } = await createClient().auth.resetPasswordForEmail(email, {
        redirectTo: authRedirectUrl("/reset-password"),
      })
      if (error) {
        return error.message
      }
      setSent(true)
    }
  )

  return (
    <form {...formProps}>
      <FieldGroup>
        <Field data-invalid={!!errors.email}>
          <FieldLabel htmlFor="forgot-password-email">Email</FieldLabel>
          <Input
            id="forgot-password-email"
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
          <Button type="submit" disabled={pending}>
            Send reset link
          </Button>
          <FieldError className="text-center">{formError}</FieldError>
          {sent && (
            <FieldDescription role="status" className="text-center">
              If an account exists for that email, a reset link is on its way.
            </FieldDescription>
          )}
        </Field>
      </FieldGroup>
    </form>
  )
}

export function ForgotPasswordDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Forgot your password?</DialogTitle>
          <DialogDescription>
            Enter your email and we&apos;ll send you a link to reset your
            password.
          </DialogDescription>
        </DialogHeader>
        <ForgotPasswordForm />
      </DialogContent>
    </Dialog>
  )
}
