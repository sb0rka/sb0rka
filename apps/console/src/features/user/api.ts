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
  return apiRequest<User>({ path: "/identity/users/current" })
}

export async function updateProfile(fields: ProfileUpdate): Promise<User> {
  const json: Record<string, string> = {}
  if (fields.username) json.username = fields.username
  if (fields.email) json.email = fields.email
  if (fields.phone) json.phone = fields.phone

  return apiRequest<User>({ method: "PATCH", path: "/identity/users/current", json })
}

export async function changePassword(data: PasswordChange): Promise<void> {
  return apiRequest<void>({
    method: "PUT",
    path: "/identity/users/current/password",
    json: {
      current_password: data.current_password,
      new_password: data.new_password,
    },
  })
}
