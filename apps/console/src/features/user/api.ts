import { apiRequest } from "@/lib/api-client"
import type { User } from "@/features/auth/api"

export type { User }

export interface ProfileUpdate {
  username?: string
  email?: string
  phone?: string
}

export interface PasswordChange {
  current_password: string
  new_password: string
}

export async function getUser(): Promise<User> {
  return apiRequest<User>({ path: "/user" })
}

export async function updateProfile(fields: ProfileUpdate): Promise<User> {
  const body: Record<string, string> = {}
  if (fields.username) body.username = fields.username
  if (fields.email) body.email = fields.email
  if (fields.phone) body.phone = fields.phone

  return apiRequest<User>({ method: "PATCH", path: "/user", body })
}

export async function changePassword(data: PasswordChange): Promise<void> {
  return apiRequest<void>({
    method: "PUT",
    path: "/user/password",
    body: {
      current_password: data.current_password,
      new_password: data.new_password,
    },
  })
}
