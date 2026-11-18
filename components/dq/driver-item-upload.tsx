"use client"

import { Camera, FileUp } from "lucide-react"
import { useRouter } from "next/navigation"
import { useRef, useState } from "react"
import { toast } from "sonner"

import { DQ_ACCEPT, uploadDqFile } from "@/components/dq/dq-upload"
import { Button } from "@/components/ui/button"

/**
 * The driver's two ways to send a document: the camera, or a photo or PDF
 * already on the phone. It goes to their carrier to check.
 */
export function DriverItemUpload({ itemId }: { itemId: string }) {
  const router = useRouter()
  const camera = useRef<HTMLInputElement>(null)
  const files = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState(false)

  async function send(file: File | undefined) {
    if (!file) return
    setPending(true)
    const result = await uploadDqFile(itemId, file)
    setPending(false)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    toast.success("Sent. Your carrier will check it.")
    router.refresh()
  }

  const onChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ""
    void send(file)
  }

  return (
    <div className="mt-3 grid grid-cols-2 gap-2">
      <Button
        size="lg"
        className="h-11"
        disabled={pending}
        onClick={() => camera.current?.click()}
      >
        <Camera /> {pending ? "Sending…" : "Take photo"}
      </Button>
      <Button
        size="lg"
        variant="outline"
        className="h-11"
        disabled={pending}
        onClick={() => files.current?.click()}
      >
        <FileUp /> Choose file
      </Button>
      <input
        ref={camera}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        onChange={onChange}
      />
      <input
        ref={files}
        type="file"
        accept={DQ_ACCEPT}
        className="sr-only"
        tabIndex={-1}
        onChange={onChange}
      />
    </div>
  )
}
