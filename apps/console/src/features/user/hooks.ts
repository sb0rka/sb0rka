import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useAuth } from "@/features/auth/auth-provider"
import { getUser, updateProfile, changePassword } from "./api"
import type { User, ProfileUpdate, PasswordChange } from "./api"

export function useUser() {
  const { isAuthenticated } = useAuth()

  return useQuery<User>({
    queryKey: ["user"],
    queryFn: getUser,
    enabled: isAuthenticated,
  })
}

export function useUpdateProfile() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: (fields: ProfileUpdate) => updateProfile(fields),
    onMutate: async (fields) => {
      await qc.cancelQueries({ queryKey: ["user"] })
      const previous = qc.getQueryData<User>(["user"])

      qc.setQueryData<User>(["user"], (old) => {
        if (!old) return old
        return {
          ...old,
          ...(fields.username !== undefined && { username: fields.username }),
          ...(fields.email !== undefined && { email: fields.email }),
          ...(fields.phone !== undefined && { phone: Number(fields.phone) }),
        }
      })

      return { previous }
    },
    onError: (_err, _fields, context) => {
      if (context?.previous) {
        qc.setQueryData(["user"], context.previous)
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["user"] })
    },
  })
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (data: PasswordChange) => changePassword(data),
  })
}
