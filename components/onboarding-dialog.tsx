"use client"

import { cn } from "cn"
import { usePathname, useRouter } from "next/navigation"
import { useState } from "react"

import {
  PROFILE_SECTIONS,
  ProfileFields,
  saveCompanyProfile,
  useProfileSectionForm,
  type ProfileSection,
} from "@/components/settings/company-profile-form"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FieldError } from "@/components/ui/field"
import type { OrganizationProfile } from "@/lib/organizations"

const STEPS: ProfileSection[] = ["company", "contact", "address"]

// The name was just chosen when creating the organization, so step 1 covers
// only the rest of the company details and gets wording to match.
const STEP_DESCRIPTIONS: Partial<Record<ProfileSection, string>> = {
  company: "Your registered name and operating authority.",
}

function OnboardingStep({
  step,
  organizationId,
  profile,
  onSaved,
  onBack,
  onSkip,
}: {
  step: number
  organizationId: string
  profile: Partial<OrganizationProfile>
  onSaved: (values: Partial<OrganizationProfile>) => void
  onBack: () => void
  onSkip: () => void
}) {
  const section = STEPS[step]
  const isLast = step === STEPS.length - 1

  const { fields, errors, formError, pending, formProps } =
    useProfileSectionForm(
      section,
      async (values) => {
        // Nothing typed in: move on without a round trip.
        if (Object.values(values).some((value) => value !== null)) {
          const error = await saveCompanyProfile(organizationId, values)
          if (error) {
            return error
          }
        }
        onSaved(values)
      },
      ["name"]
    )

  return (
    <form {...formProps} className="flex flex-col gap-6">
      <div className="space-y-1">
        <h3 className="font-semibold">{PROFILE_SECTIONS[section].title}</h3>
        <p className="text-sm text-muted-foreground">
          {STEP_DESCRIPTIONS[section] ?? PROFILE_SECTIONS[section].description}
        </p>
      </div>
      <fieldset disabled={pending} className="grid gap-5 sm:grid-cols-6">
        <ProfileFields
          // Without the name beside it, the legal name gets the full row.
          fields={fields.map((field) =>
            field.name === "legal_name" ? { ...field, span: 6 } : field
          )}
          profile={profile}
          errors={errors}
          idPrefix="onboarding"
        />
      </fieldset>
      {formError && <FieldError>{formError}</FieldError>}
      <div className="-mx-6 -mb-6 flex flex-col-reverse gap-3 border-t bg-muted/40 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
        <Button type="button" variant="ghost" onClick={onSkip}>
          Skip for now
        </Button>
        <div className="flex gap-3 sm:justify-end">
          {step > 0 && (
            <Button
              type="button"
              variant="outline"
              className="flex-1 sm:flex-none"
              disabled={pending}
              onClick={onBack}
            >
              Back
            </Button>
          )}
          <Button
            type="submit"
            className="flex-1 sm:flex-none"
            disabled={pending}
          >
            {pending ? "Saving…" : isLast ? "Finish" : "Continue"}
          </Button>
        </div>
      </div>
    </form>
  )
}

/**
 * Shown once, right after an organization is created, to fill in the company
 * profile. Every step saves as it goes, and any of it can be skipped and
 * finished later in Settings → General.
 */
export function OnboardingDialog({
  organizationId,
  organizationName,
}: {
  organizationId: string
  organizationName: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [open, setOpen] = useState(true)
  const [step, setStep] = useState(0)
  // What's been saved so far, so going back shows it again.
  const [profile, setProfile] = useState<Partial<OrganizationProfile>>({})

  function close() {
    setOpen(false)
    // Drop ?welcome so a refresh doesn't bring the popup back.
    router.replace(pathname, { scroll: false })
    router.refresh()
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <p className="text-sm font-medium text-primary">
            Step {step + 1} of {STEPS.length}
          </p>
          <DialogTitle className="text-xl">
            Set up {organizationName}
          </DialogTitle>
          <DialogDescription>
            Add your company details now, or skip and finish later in Settings.
          </DialogDescription>
          <div className="flex gap-1.5 pt-2" aria-hidden>
            {STEPS.map((s, index) => (
              <div
                key={s}
                className={cn(
                  "h-1 flex-1 rounded-full bg-muted transition-colors",
                  index <= step && "bg-primary"
                )}
              />
            ))}
          </div>
        </DialogHeader>
        {/* Keyed by step so each step's form state starts fresh. */}
        <OnboardingStep
          key={step}
          step={step}
          organizationId={organizationId}
          profile={profile}
          onSaved={(values) => {
            setProfile((prev) => ({ ...prev, ...values }))
            if (step === STEPS.length - 1) {
              close()
            } else {
              setStep(step + 1)
            }
          }}
          onBack={() => setStep(step - 1)}
          onSkip={close}
        />
      </DialogContent>
    </Dialog>
  )
}
