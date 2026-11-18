import type { Metadata } from "next"
import { Geist_Mono, Inter, Space_Grotesk } from "next/font/google"

import "./globals.css"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" })

// Headings on the driver qualification file screens.
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
})

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

export const metadata: Metadata = {
  title: "OfficeTruck",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      className={cn(
        "antialiased",
        fontMono.variable,
        spaceGrotesk.variable,
        "font-sans",
        inter.variable
      )}
    >
      <body>
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster position="bottom-right" />
      </body>
    </html>
  )
}
