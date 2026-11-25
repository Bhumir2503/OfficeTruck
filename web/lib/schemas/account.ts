import { z } from "zod"

export const profileNameSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(1, "Enter your full name.")
    .max(100, "Must be 100 characters or fewer."),
})

export const changeEmailSchema = z.object({
  email: z.email("Enter a valid email address."),
})

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password."),
    password: z.string().min(8, "Must be at least 8 characters long."),
    confirmPassword: z.string().min(1, "Confirm your new password."),
  })
  .refine(
    (data) => !data.confirmPassword || data.password === data.confirmPassword,
    {
      message: "Passwords don't match.",
      path: ["confirmPassword"],
    }
  )
  .refine((data) => !data.password || data.password !== data.currentPassword, {
    message: "Choose a password different from your current one.",
    path: ["password"],
  })
