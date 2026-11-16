"use client"

import { ImageIcon, Loader2, Trash2, Upload } from "lucide-react"
import { useRouter } from "next/navigation"
import { useRef, useState } from "react"
import { toast } from "sonner"

import {
  SettingsCard,
  SettingsCardFooter,
} from "@/components/settings/settings-card"
import { Button } from "@/components/ui/button"
import { LOGO_TYPES, logoFileError, toLogoImage } from "@/lib/logo"
import { createClient } from "@/lib/supabase/client"

const BUCKET = "organization-logos"

/**
 * The company logo, shown on invoices and the packet PDF. Changes save
 * straight away. Owners and admins can change it.
 */
export function LogoUpload({
  organizationId,
  logoUrl,
  canEdit,
}: {
  organizationId: string
  logoUrl: string | null
  canEdit: boolean
}) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [url, setUrl] = useState(logoUrl)
  const [pending, setPending] = useState<"upload" | "remove" | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function saveUrl(next: string | null) {
    const { data, error } = await createClient()
      .from("organizations")
      .update({ logo_url: next })
      .eq("id", organizationId)
      .select("id")
    if (error) {
      throw error
    }
    // Row-level security skips the update for members.
    if (!data.length) {
      throw new Error("Only owners and admins can change the logo.")
    }
  }

  /** Deletes the organization's stored logos, except `keep`. */
  async function removeOldFiles(keep?: string) {
    const storage = createClient().storage.from(BUCKET)
    const { data } = await storage.list(organizationId)
    const old = (data ?? [])
      .map((file) => `${organizationId}/${file.name}`)
      .filter((path) => path !== keep)
    if (old.length) {
      await storage.remove(old)
    }
  }

  async function upload(file: File) {
    const problem = logoFileError(file)
    if (problem) {
      setError(problem)
      return
    }
    setPending("upload")
    setError(null)
    try {
      const image = await toLogoImage(file)
      // A new name each time, so browsers and the CDN never show a stale logo.
      const path = `${organizationId}/${crypto.randomUUID()}.png`
      const storage = createClient().storage.from(BUCKET)
      const { error } = await storage.upload(path, image, {
        contentType: "image/png",
      })
      if (error) {
        throw error
      }
      const next = storage.getPublicUrl(path).data.publicUrl
      await saveUrl(next)
      await removeOldFiles(path)
      setUrl(next)
      toast.success("Logo updated. It shows on your invoices.")
      router.refresh()
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The logo couldn't be uploaded. Try again."
      )
    } finally {
      setPending(null)
    }
  }

  async function remove() {
    setPending("remove")
    setError(null)
    try {
      await saveUrl(null)
      await removeOldFiles()
      setUrl(null)
      toast.success("Logo removed.")
      router.refresh()
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The logo couldn't be removed. Try again."
      )
    } finally {
      setPending(null)
    }
  }

  return (
    <SettingsCard
      title="Logo"
      description="Shown at the top of your invoices and invoice packets."
      footer={
        <SettingsCardFooter
          hint={
            error ? (
              <span className="text-destructive">{error}</span>
            ) : canEdit ? (
              "PNG, JPG or WebP. A wide logo on a clear or white background works best."
            ) : (
              "Only owners and admins can change the logo."
            )
          }
        >
          {canEdit && (
            <>
              {url && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={pending !== null}
                  onClick={() => void remove()}
                >
                  {pending === "remove" ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <Trash2 />
                  )}
                  Remove
                </Button>
              )}
              <Button
                type="button"
                size="sm"
                disabled={pending !== null}
                onClick={() => inputRef.current?.click()}
              >
                {pending === "upload" ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <Upload />
                )}
                {url ? "Replace logo" : "Upload logo"}
              </Button>
            </>
          )}
        </SettingsCardFooter>
      }
    >
      <input
        ref={inputRef}
        type="file"
        accept={LOGO_TYPES.join(",")}
        className="hidden"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0]
          event.currentTarget.value = ""
          if (file) void upload(file)
        }}
      />
      {/* A white tile in both themes, like the invoice it goes on. */}
      <div className="flex h-28 items-center justify-center rounded-lg border border-dashed bg-white px-6">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element -- a public storage URL, shown as is
          <img
            src={url}
            alt="Company logo"
            className="max-h-20 max-w-full object-contain"
          />
        ) : (
          <span className="flex items-center gap-2 text-sm text-neutral-500">
            <ImageIcon className="size-4" />
            No logo yet
          </span>
        )}
      </div>
    </SettingsCard>
  )
}
