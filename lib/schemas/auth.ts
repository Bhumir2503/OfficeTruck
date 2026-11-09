import { z } from "zod"

const email = z.email("Enter a valid email address.")

export const loginSchema = z.object({
  email,
  password: z.string().min(1, "Enter your password."),
})

export const signupSchema = z
  .object({
    name: z.string().trim().min(1, "Enter your full name."),
    email,
    password: z.string().min(8, "Must be at least 8 characters long."),
    confirmPassword: z.string().min(1, "Confirm your password."),
  })
  .refine(
    (data) => !data.confirmPassword || data.password === data.confirmPassword,
    { message: "Passwords don't match.", path: ["confirmPassword"] }
  )

export const forgotPasswordSchema = z.object({ email })
