import { cn } from "cn"
import Image from "next/image"
import Link from "next/link"

// The artwork has built-in padding, which -my-3 trims from the layout.
export function Logo({ className }: { className?: string }) {
  return (
    <Link href="/" className={cn("-my-3 block shrink-0", className)}>
      <Image
        width={591}
        height={176}
        loading="eager"
        alt="OfficeTruck"
        src="/officetruck-logo/officetruck-logo.svg"
        className="h-14 w-auto"
      />
    </Link>
  )
}
