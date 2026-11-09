"use client"

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

// Lives inside the dialog content so its state resets each time it closes.
function ForgotPasswordForm() {
  const { errors, submitted, formProps } = useZodForm(forgotPasswordSchema)

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
          <Button type="submit">Send reset link</Button>
          {submitted && (
            <FieldDescription role="status" className="text-center">
              Looks good, but password reset isn&apos;t connected yet.
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
