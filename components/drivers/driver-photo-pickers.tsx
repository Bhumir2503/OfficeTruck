"use client"

import { FileText, ImageIcon, Upload } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import {
  PHOTO_LABELS,
  PHOTO_TYPES,
  photoFileError,
} from "@/lib/driver-photo-upload"
import type { DriverPhotoKind } from "@/lib/drivers"

/** A picked file, with a local link to preview it if it's an image. */
export type PickedPhoto = { file: File; preview: string | null }
export type PickedPhotos = Partial<Record<DriverPhotoKind, PickedPhoto>>

function pick(file: File): PickedPhoto {
  return {
    file,
    preview: file.type === "application/pdf" ? null : URL.createObjectURL(file),
  }
}

function PickerSlot({
  kind,
  photo,
  error,
  disabled,
  onPick,
}: {
  kind: DriverPhotoKind
  photo: PickedPhoto | undefined
  error: string | null
  disabled: boolean
  /** A new file, or undefined to clear it. */
  onPick: (file: File | undefined) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const file = photo?.file
  const preview = photo?.preview
  const label = PHOTO_LABELS[kind]

  return (
    <div className="flex flex-col gap-3">
      <div className="text-sm font-medium">{label}</div>
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        aria-label={
          file ? `Change the ${label} file` : `Choose a ${label} file`
        }
        className={
          file
            ? "flex aspect-[1.586] items-center justify-center overflow-hidden rounded-lg border bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            : "flex aspect-[1.586] flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-sm text-muted-foreground transition-colors hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        }
      >
        {file ? (
          preview ? (
            // A local blob URL; next/image can't optimize it.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview}
              alt={`${label} photo`}
              className="size-full object-contain"
            />
          ) : (
            <span className="flex flex-col items-center gap-2 px-4 text-sm text-muted-foreground">
              <FileText className="size-8" />
              <span className="max-w-full truncate">{file.name}</span>
            </span>
          )
        ) : (
          <>
            <ImageIcon className="size-6" />
            Choose a photo or PDF
          </>
        )}
      </button>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
        >
          <Upload />
          {file ? "Change" : "Choose file"}
        </Button>
        {file && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled}
            onClick={() => onPick(undefined)}
          >
            Remove
          </Button>
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {/* No name, so the file isn't part of the form's data. */}
      <input
        ref={inputRef}
        type="file"
        accept={PHOTO_TYPES.join(",")}
        className="hidden"
        onChange={(event) => {
          const picked = event.currentTarget.files?.[0]
          event.currentTarget.value = ""
          if (picked) {
            onPick(picked)
          }
        }}
      />
    </div>
  )
}

/**
 * CDL and medical card pickers for a driver who hasn't been saved yet. The
 * files stay in the browser and are uploaded once the driver exists.
 */
export function DriverPhotoPickers({
  photos,
  onChange,
  disabled = false,
}: {
  photos: PickedPhotos
  onChange: (photos: PickedPhotos) => void
  disabled?: boolean
}) {
  const [errors, setErrors] = useState<
    Partial<Record<DriverPhotoKind, string>>
  >({})

  // Let go of the preview links when the form goes away.
  const latest = useRef(photos)
  useEffect(() => {
    latest.current = photos
  }, [photos])
  useEffect(
    () => () => {
      for (const photo of Object.values(latest.current)) {
        if (photo?.preview) URL.revokeObjectURL(photo.preview)
      }
    },
    []
  )

  function choose(kind: DriverPhotoKind, file: File | undefined) {
    const problem = file ? photoFileError(file) : null
    setErrors((current) => ({ ...current, [kind]: problem ?? undefined }))
    if (problem) {
      return
    }
    const old = photos[kind]
    if (old?.preview) URL.revokeObjectURL(old.preview)
    onChange({ ...photos, [kind]: file ? pick(file) : undefined })
  }

  return (
    <div className="grid gap-6 sm:grid-cols-2">
      {(["cdl", "medical_card"] as const).map((kind) => (
        <PickerSlot
          key={kind}
          kind={kind}
          photo={photos[kind]}
          error={errors[kind] ?? null}
          disabled={disabled}
          onPick={(file) => choose(kind, file)}
        />
      ))}
    </div>
  )
}
