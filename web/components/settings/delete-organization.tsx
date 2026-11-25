"use client"

import { TriangleAlertIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"

import {
  SettingsCard,
  SettingsCardFooter,
} from "@/components/settings/settings-card"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { createClient } from "@/lib/supabase/client"

// Lives inside the dialog content so the typed confirmation resets on close.
function DeleteOrganizationForm({
  organizationId,
  name,
  slug,
}: {
  organizationId: string
  name: string
  slug: string
}) {
  const router = useRouter()
  const [confirmation, setConfirmation] = useState("")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const confirmed = confirmation.trim() === slug

  async function deleteOrganization(event: React.FormEvent) {
    event.preventDefault()
    if (!confirmed || pending) {
      return
    }
    setPending(true)
    setError(null)
    const { data, error } = await createClient()
      .from("organizations")
      .delete()
      .eq("id", organizationId)
      .select("id")
    if (error || !data.length) {
      setPending(false)
      // Row-level security skips the delete, rather than failing, for non-owners.
      setError(error?.message ?? "Only owners can delete the organization.")
      return
    }
    // "/" sends the user to another organization, or the picker if none are left.
    router.replace("/")
    router.refresh()
  }

  return (
    <form onSubmit={deleteOrganization} className="flex flex-col gap-6">
      <DialogHeader>
        <div className="mb-2 flex size-10 items-center justify-center rounded-full bg-destructive/10">
          <TriangleAlertIcon className="size-5 text-destructive" />
        </div>
        <DialogTitle>Delete {name}?</DialogTitle>
        <DialogDescription>
          This permanently deletes the organization and removes everyone&apos;s
          access to it. It can&apos;t be undone.
        </DialogDescription>
      </DialogHeader>
      <Field data-invalid={!!error}>
        <FieldLabel htmlFor="delete-confirmation">
          Type <span className="font-mono font-semibold">{slug}</span> to
          confirm
        </FieldLabel>
        <Input
          id="delete-confirmation"
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          disabled={pending}
        />
        <FieldError>{error}</FieldError>
      </Field>
      <DialogFooter>
        <DialogClose
          render={<Button type="button" variant="outline" disabled={pending} />}
        >
          Cancel
        </DialogClose>
        <Button
          type="submit"
          className="bg-destructive text-white hover:bg-destructive/90"
          disabled={!confirmed || pending}
        >
          {pending ? "Deleting…" : "Delete organization"}
        </Button>
      </DialogFooter>
    </form>
  )
}

export function DeleteOrganization({
  organizationId,
  name,
  slug,
  canDelete,
}: {
  organizationId: string
  name: string
  slug: string
  canDelete: boolean
}) {
  return (
    <SettingsCard
      title="Delete this organization"
      description={`Permanently delete ${name}, its company profile and everyone's access to it. This can't be undone.`}
      className="border-destructive/40"
      footer={
        <SettingsCardFooter
          hint={
            canDelete
              ? "All of the organization's data will be deleted."
              : "Only owners can delete the organization."
          }
        >
          <Dialog>
            <DialogTrigger
              render={
                <Button variant="destructive" size="sm" disabled={!canDelete} />
              }
            >
              Delete organization
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DeleteOrganizationForm
                organizationId={organizationId}
                name={name}
                slug={slug}
              />
            </DialogContent>
          </Dialog>
        </SettingsCardFooter>
      }
    />
  )
}
