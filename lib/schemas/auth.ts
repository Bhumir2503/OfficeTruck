import { z } from "zod"

const email = z.email("Enter a valid email address.")
const newPassword = z.string().min(8, "Must be at least 8 characters long.")
const confirmPassword = z.string().min(1, "Confirm your password.")

function passwordsMatch(data: { password: string; confirmPassword: string }) {
  return !data.confirmPassword || data.password === data.confirmPassword
}
const passwordMismatch = {
  message: "Passwords don't match.",
  path: ["confirmPassword"],
}

export const loginSchema = z.object({
  email,
  password: z.string().min(1, "Enter your password."),
})

export const signupSchema = z
  .object({
    name: z.string().trim().min(1, "Enter your full name."),
    email,
    password: newPassword,
    confirmPassword,
  })
  .refine(passwordsMatch, passwordMismatch)

export const forgotPasswordSchema = z.object({ email })

export const resetPasswordSchema = z
  .object({ password: newPassword, confirmPassword })
  .refine(passwordsMatch, passwordMismatch)
