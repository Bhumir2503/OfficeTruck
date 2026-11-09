import { cn } from "cn"
import Image from "next/image"
import Link from "next/link"

const imageProps = {
  width: 591,
  height: 176,
  loading: "eager",
} as const

// The artwork has built-in padding, which -my-3 trims from the layout.
// Both versions render and CSS picks one, so the saved theme never flashes.
export function Logo({ className }: { className?: string }) {
  return (
    <Link href="/" className={cn("-my-3 block shrink-0", className)}>
      <Image
        {...imageProps}
        alt="OfficeTruck"
        src="/officetruck-logo/officetruck-logo.svg"
        className="h-14 w-auto dark:hidden"
      />
      <Image
        {...imageProps}
        alt="OfficeTruck"
        src="/officetruck-logo/officetruck-logo-reversed.svg"
        className="hidden h-14 w-auto dark:block"
      />
    </Link>
  )
}
