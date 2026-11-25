"use client"

import { CameraIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useRef, useState } from "react"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { AVATAR_TYPES, avatarFileError, toAvatarImage } from "@/lib/avatar"
import { initials } from "@/lib/initials"
import { createClient } from "@/lib/supabase/client"

const BUCKET = "avatars"

/**
 * The user's profile picture with buttons to upload a new one or remove it.
 * Changes save straight away, separately from the rest of the profile form.
 */
export function AvatarUpload({
  userId,
  name,
  avatarUrl,
}: {
  userId: string
  /** Used for the initials shown when there's no picture. */
  name: string
  avatarUrl: string | null
}) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [url, setUrl] = useState(avatarUrl)
  const [pending, setPending] = useState<"upload" | "remove" | null>(null)
  const [error, setError] = useState<string | null>(null)

  /** Saves the picture's URL to the profile and the session, which the sidebar reads. */
  async function saveAvatarUrl(next: string | null) {
    const supabase = createClient()
    const { error } = await supabase
      .from("profiles")
      .update({ avatar_url: next })
      .eq("id", userId)
    if (error) {
      throw error
    }
    const { error: metadataError } = await supabase.auth.updateUser({
      data: { avatar_url: next },
    })
    if (metadataError) {
      throw metadataError
    }
    await supabase.auth.refreshSession()
  }

  /** Deletes the user's stored pictures, except `keep`. */
  async function removeOldFiles(keep?: string) {
    const storage = createClient().storage.from(BUCKET)
    const { data } = await storage.list(userId)
    const old = (data ?? [])
      .map((file) => `${userId}/${file.name}`)
      .filter((path) => path !== keep)
    if (old.length) {
      await storage.remove(old)
    }
  }

  async function upload(file: File) {
    const problem = avatarFileError(file)
    if (problem) {
      setError(problem)
      return
    }

    setPending("upload")
    setError(null)
    try {
      const image = await toAvatarImage(file)
      // A new name each time, so browsers and the CDN never show a stale picture.
      const path = `${userId}/${crypto.randomUUID()}.webp`
      const storage = createClient().storage.from(BUCKET)
      const { error } = await storage.upload(path, image, {
        contentType: "image/webp",
        cacheControl: "31536000",
      })
      if (error) {
        throw error
      }
      const next = storage.getPublicUrl(path).data.publicUrl
      await saveAvatarUrl(next)
      setUrl(next)
      await removeOldFiles(path)
      router.refresh()
    } catch (error) {
      setError(
        error instanceof Error && error.message
          ? `Couldn't upload the picture: ${error.message}`
          : "Couldn't upload the picture. Please try again."
      )
    } finally {
      setPending(null)
    }
  }

  async function remove() {
    setPending("remove")
    setError(null)
    try {
      await saveAvatarUrl(null)
      setUrl(null)
      await removeOldFiles()
      router.refresh()
    } catch {
      setError("Couldn't remove the picture. Please try again.")
    } finally {
      setPending(null)
    }
  }

  return (
    <div className="flex items-center gap-4">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={!!pending}
        className="group relative shrink-0 rounded-full focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        aria-label="Upload a new profile picture"
      >
        <Avatar className="size-16 text-lg">
          {url && <AvatarImage src={url} alt="" />}
          <AvatarFallback className="text-lg">{initials(name)}</AvatarFallback>
        </Avatar>
        <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
          <CameraIcon className="size-5" />
        </span>
      </button>

      <div className="min-w-0 space-y-2">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!!pending}
            onClick={() => inputRef.current?.click()}
          >
            {pending === "upload"
              ? "Uploading…"
              : url
                ? "Change photo"
                : "Upload photo"}
          </Button>
          {url && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={!!pending}
              onClick={remove}
            >
              {pending === "remove" ? "Removing…" : "Remove"}
            </Button>
          )}
        </div>
        <p
          role="status"
          className={
            error ? "text-sm text-destructive" : "text-sm text-muted-foreground"
          }
        >
          {error ?? "PNG, JPG, WebP or GIF. Cropped to a square."}
        </p>
      </div>

      {/* No name, so it isn't part of the profile form's data. */}
      <input
        ref={inputRef}
        type="file"
        accept={AVATAR_TYPES.join(",")}
        className="hidden"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0]
          event.currentTarget.value = ""
          if (file) {
            void upload(file)
          }
        }}
      />
    </div>
  )
}
