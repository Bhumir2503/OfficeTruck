import { cn } from "cn"

import {
  SettingsCard,
  SettingsCardFooter,
  SettingsPage,
} from "@/components/settings/settings-card"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Skeleton } from "@/components/ui/skeleton"
import { ACCOUNT } from "@/lib/org-nav"

/*
 * Loading state for the profile page. Titles, labels and hints are the real
 * text so nothing shifts when the page arrives; only values and buttons are
 * grey placeholders.
 */

function ButtonSkeleton({ className }: { className?: string }) {
  return (
    <Skeleton
      className={cn("h-8 w-14 rounded-md bg-foreground/10", className)}
    />
  )
}

function InputField({
  label,
  className,
}: {
  label: string
  className?: string
}) {
  return (
    <Field className={className}>
      <FieldLabel>{label}</FieldLabel>
      <Skeleton className="h-9 w-full" />
    </Field>
  )
}

export function AccountSkeleton() {
  return (
    <div className="px-4 py-6 lg:px-6 lg:py-8">
      <div className="max-w-3xl">
        <SettingsPage title={ACCOUNT.title} description={ACCOUNT.description}>
          <SettingsCard
            title="Profile"
            description="How you appear to your team in OfficeTruck."
            footer={
              <SettingsCardFooter>
                <ButtonSkeleton />
              </SettingsCardFooter>
            }
          >
            <div className="flex flex-col gap-6">
              <div className="flex items-center gap-4">
                <Skeleton className="size-16 shrink-0 rounded-full" />
                <div className="min-w-0 space-y-2">
                  <Skeleton className="h-8 w-28 rounded-md" />
                  <p className="text-sm text-muted-foreground">
                    PNG, JPG, WebP or GIF. Cropped to a square.
                  </p>
                </div>
              </div>
              <Field>
                <FieldLabel>Full name</FieldLabel>
                <Skeleton className="h-9 w-full" />
                <FieldDescription>
                  Shown in the members list and on work you do.
                </FieldDescription>
              </Field>
            </div>
          </SettingsCard>

          <SettingsCard
            title="Email"
            description="The address you sign in with and where we send account emails."
            footer={
              <SettingsCardFooter hint="We'll email a confirmation link before the change takes effect.">
                <ButtonSkeleton className="w-28" />
              </SettingsCardFooter>
            }
          >
            <InputField label="Email address" />
          </SettingsCard>

          <SettingsCard
            title="Password"
            description="Use a password you don't use anywhere else."
            footer={
              <SettingsCardFooter hint="At least 8 characters.">
                <ButtonSkeleton className="w-32" />
              </SettingsCardFooter>
            }
          >
            <div className="grid gap-5 sm:grid-cols-2">
              <Field className="sm:col-span-2">
                <FieldLabel>Current password</FieldLabel>
                <Skeleton className="h-9 w-full sm:max-w-[calc(50%-0.625rem)]" />
              </Field>
              <InputField label="New password" />
              <InputField label="Confirm new password" />
            </div>
          </SettingsCard>

          <SettingsCard
            title="Organizations"
            description="Every organization you're a member of, and your role in it."
            contentClassName="px-0 pb-0"
          >
            <ul className="divide-y border-t">
              {["w-32", "w-24"].map((width) => (
                <li key={width} className="flex items-center gap-3 px-6 py-3">
                  <Skeleton className="size-8 shrink-0 rounded-md" />
                  <div className="min-w-0 flex-1">
                    <div className="flex h-5 items-center">
                      <Skeleton className={cn("h-4", width)} />
                    </div>
                    <div className="flex h-5 items-center">
                      <Skeleton className="h-3.5 w-28" />
                    </div>
                  </div>
                  <Skeleton className="h-5 w-14 rounded-full" />
                  <div className="size-4" />
                </li>
              ))}
            </ul>
          </SettingsCard>

          <SettingsCard
            title="Sessions"
            description="Signed in on a shared or lost device? Sign out of OfficeTruck on every browser and phone, including this one."
            footer={
              <SettingsCardFooter hint="You'll need to sign in again everywhere.">
                <ButtonSkeleton className="w-40" />
              </SettingsCardFooter>
            }
          />
        </SettingsPage>
      </div>
    </div>
  )
}
