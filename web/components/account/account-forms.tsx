"use client"

import { LogOutIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useRef, useState } from "react"

import {
  SettingsCard,
  SettingsCardFooter,
} from "@/components/settings/settings-card"
import { AvatarUpload } from "@/components/account/avatar-upload"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { useZodForm } from "@/hooks/use-zod-form"
import type { Account } from "@/lib/account"
import {
  changeEmailSchema,
  changePasswordSchema,
  profileNameSchema,
} from "@/lib/schemas/account"
import { authRedirectUrl, createClient } from "@/lib/supabase/client"

/** Footer for a form card: the error or a success message, and a submit button. */
function FormFooter({
  hint,
  formError,
  success,
  pending,
  label,
  pendingLabel,
}: {
  hint?: React.ReactNode
  formError: string | null
  success: string | null
  pending: boolean
  label: string
  pendingLabel: string
}) {
  return (
    <SettingsCardFooter hint={formError ? null : (success ?? hint)}>
      {formError && <FieldError>{formError}</FieldError>}
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? pendingLabel : label}
      </Button>
    </SettingsCardFooter>
  )
}

export function ProfileForm({ account }: { account: Account }) {
  const router = useRouter()
  const [name, setName] = useState(account.fullName)
  const [success, setSuccess] = useState<string | null>(null)

  const { errors, formError, pending, formProps } = useZodForm(
    profileNameSchema,
    async ({ fullName }) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from("profiles")
        .update({ full_name: fullName })
        .eq("id", account.id)
        .select("id")
      if (error) {
        return error.message
      }
      if (!data.length) {
        return "Your profile couldn't be found. Try signing out and back in."
      }
      // The sidebar reads the name from the session, so update it there too.
      const { error: metadataError } = await supabase.auth.updateUser({
        data: { full_name: fullName },
      })
      if (metadataError) {
        return metadataError.message
      }
      await supabase.auth.refreshSession()
      setSuccess("Changes saved.")
      router.refresh()
    }
  )

  return (
    <form
      {...formProps}
      onChange={(event) => {
        setSuccess(null)
        formProps.onChange(event)
      }}
    >
      <SettingsCard
        title="Profile"
        description="How you appear to your team in OfficeTruck."
        footer={
          <FormFooter
            formError={formError}
            success={success}
            pending={pending}
            label="Save"
            pendingLabel="Saving…"
          />
        }
      >
        <div className="flex flex-col gap-6">
          <AvatarUpload
            userId={account.id}
            name={name || account.email}
            avatarUrl={account.avatarUrl}
          />
          <fieldset disabled={pending}>
            <Field data-invalid={!!errors.fullName}>
              <FieldLabel htmlFor="account-full-name">Full name</FieldLabel>
              <Input
                id="account-full-name"
                name="fullName"
                defaultValue={account.fullName}
                autoComplete="name"
                required
                aria-invalid={!!errors.fullName}
                onInput={(event) => setName(event.currentTarget.value)}
              />
              {errors.fullName ? (
                <FieldError errors={errors.fullName} />
              ) : (
                <FieldDescription>
                  Shown in the members list and on work you do.
                </FieldDescription>
              )}
            </Field>
          </fieldset>
        </div>
      </SettingsCard>
    </form>
  )
}

/** How a confirmation link from a change-email message went, from `?email_link=`. */
export type EmailLinkResult = "confirmed" | "invalid" | null

function linkMessages(account: Account, result: EmailLinkResult) {
  if (result === "invalid") {
    return {
      success: null,
      error:
        "That confirmation link is invalid or has expired. Request the change again.",
    }
  }
  if (result === "confirmed") {
    return {
      success: account.newEmail
        ? `Link accepted. Now open the link we sent to the other address to finish changing to ${account.newEmail}.`
        : `Your email is now ${account.email}. Use it to sign in from now on.`,
      error: null,
    }
  }
  return { success: null, error: null }
}

export function EmailForm({
  account,
  linkResult = null,
}: {
  account: Account
  linkResult?: EmailLinkResult
}) {
  const router = useRouter()
  const initial = linkMessages(account, linkResult)
  const [success, setSuccess] = useState<string | null>(initial.success)
  const [linkError, setLinkError] = useState<string | null>(initial.error)

  const { errors, formError, pending, formProps } = useZodForm(
    changeEmailSchema,
    async ({ email }) => {
      if (email.toLowerCase() === account.email.toLowerCase()) {
        return "That's already your email address."
      }
      const { error } = await createClient().auth.updateUser(
        { email },
        { emailRedirectTo: authRedirectUrl("/account") }
      )
      if (error) {
        return error.message
      }
      setSuccess(
        `Check ${email} for a confirmation link. If one also arrives at ${account.email}, open both.`
      )
      router.refresh()
    }
  )

  return (
    <form
      {...formProps}
      onChange={(event) => {
        setSuccess(null)
        setLinkError(null)
        formProps.onChange(event)
      }}
    >
      <SettingsCard
        title="Email"
        description="The address you sign in with and where we send account emails."
        footer={
          <FormFooter
            hint="We'll email a confirmation link before the change takes effect."
            formError={formError ?? linkError}
            success={success}
            pending={pending}
            label="Change email"
            pendingLabel="Sending…"
          />
        }
      >
        <fieldset disabled={pending}>
          <Field data-invalid={!!errors.email}>
            <FieldLabel htmlFor="account-email">Email address</FieldLabel>
            <Input
              id="account-email"
              name="email"
              type="email"
              defaultValue={account.email}
              autoComplete="email"
              required
              aria-invalid={!!errors.email}
            />
            {errors.email ? (
              <FieldError errors={errors.email} />
            ) : (
              account.newEmail && (
                <FieldDescription>
                  Changing to {account.newEmail}. Open the confirmation link in
                  your inbox (or both inboxes, if we emailed both addresses).
                  Until then, keep signing in with {account.email}.
                </FieldDescription>
              )
            )}
          </Field>
        </fieldset>
      </SettingsCard>
    </form>
  )
}

export function PasswordForm({ email }: { email: string }) {
  const formRef = useRef<HTMLFormElement>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const { errors, formError, pending, formProps } = useZodForm(
    changePasswordSchema,
    async ({ currentPassword, password }) => {
      const supabase = createClient()
      // Check the current password first, so an unattended session can't change it.
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password: currentPassword,
      })
      if (signInError) {
        return "Your current password is incorrect."
      }
      const { error } = await supabase.auth.updateUser({ password })
      if (error) {
        return error.message
      }
      formRef.current?.reset()
      setSuccess("Password updated.")
    }
  )

  return (
    <form
      ref={formRef}
      {...formProps}
      onChange={(event) => {
        setSuccess(null)
        formProps.onChange(event)
      }}
    >
      <SettingsCard
        title="Password"
        description="Use a password you don't use anywhere else."
        footer={
          <FormFooter
            hint="At least 8 characters."
            formError={formError}
            success={success}
            pending={pending}
            label="Update password"
            pendingLabel="Updating…"
          />
        }
      >
        <fieldset disabled={pending} className="grid gap-5 sm:grid-cols-2">
          <Field
            data-invalid={!!errors.currentPassword}
            className="sm:col-span-2"
          >
            <FieldLabel htmlFor="account-current-password">
              Current password
            </FieldLabel>
            <Input
              id="account-current-password"
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              required
              aria-invalid={!!errors.currentPassword}
              className="sm:max-w-[calc(50%-0.625rem)]"
            />
            <FieldError errors={errors.currentPassword} />
          </Field>
          <Field data-invalid={!!errors.password}>
            <FieldLabel htmlFor="account-new-password">New password</FieldLabel>
            <Input
              id="account-new-password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              aria-invalid={!!errors.password}
            />
            <FieldError errors={errors.password} />
          </Field>
          <Field data-invalid={!!errors.confirmPassword}>
            <FieldLabel htmlFor="account-confirm-password">
              Confirm new password
            </FieldLabel>
            <Input
              id="account-confirm-password"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              required
              aria-invalid={!!errors.confirmPassword}
            />
            <FieldError errors={errors.confirmPassword} />
          </Field>
        </fieldset>
      </SettingsCard>
    </form>
  )
}

export function SignOutEverywhere() {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function signOutEverywhere() {
    setPending(true)
    setError(null)
    const { error } = await createClient().auth.signOut({ scope: "global" })
    if (error) {
      setError(error.message)
      setPending(false)
      return
    }
    router.replace("/login")
    router.refresh()
  }

  return (
    <SettingsCard
      title="Sessions"
      description="Signed in on a shared or lost device? Sign out of OfficeTruck on every browser and phone, including this one."
      footer={
        <SettingsCardFooter
          hint={
            error ? (
              <span className="text-destructive">{error}</span>
            ) : (
              "You'll need to sign in again everywhere."
            )
          }
        >
          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabled={pending}
            onClick={signOutEverywhere}
          >
            <LogOutIcon data-icon="inline-start" />
            {pending ? "Signing out…" : "Sign out everywhere"}
          </Button>
        </SettingsCardFooter>
      }
    />
  )
}
