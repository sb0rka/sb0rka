import { beforeEach, afterEach, expect, it, vi } from "vitest"

beforeEach(() => { vi.resetModules(); localStorage.clear() })
afterEach(() => { vi.unstubAllGlobals() })
const response = (access_token = "fresh-token") => new Response(JSON.stringify({ access_token }), { status: 200, headers: { "Content-Type": "application/json" } })
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r }); return { promise, resolve } }

it("refresh uses JSON and credentials", async () => {
  const fetch = vi.fn().mockResolvedValue(response())
  vi.stubGlobal("fetch", fetch)
  const client = await import("./api-client")
  await client.refresh()
  expect(fetch.mock.calls[0][1]).toMatchObject({ method: "POST", credentials: "include", body: "{}", headers: { "Content-Type": "application/json" } })
})
it("an old refresh cannot restore a cleared session", async () => {
  const pending = deferred<Response>()
  vi.stubGlobal("fetch", vi.fn().mockReturnValue(pending.promise))
  const client = await import("./api-client")
  const store = await import("./auth-store")
  const refresh = client.refresh()
  store.clearToken()
  const rejected = expect(refresh).rejects.toMatchObject({ status: 401 })
  pending.resolve(response("old-token"))
  await rejected
  expect(store.getToken()).toBeNull()
  expect(localStorage.getItem("access_token")).toBeNull()
})
it("clearing a session rejects a response whose body arrives later", async () => {
  const body = deferred<unknown>()
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status: 200, ok: true, json: () => body.promise }))
  const client = await import("./api-client")
  const store = await import("./auth-store")
  const request = client.apiRequest({ path: "/identity/users/current" })
  await new Promise(r => setTimeout(r, 0))
  store.clearToken()
  const rejected = expect(request).rejects.toMatchObject({ status: 401 })
  body.resolve({ id: "old-user" })
  await rejected
})
it("an old refresh cannot clear the new refresh promise", async () => {
  const old = deferred<Response>(), fresh = deferred<Response>()
  const fetch = vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise)
  vi.stubGlobal("fetch", fetch)
  const client = await import("./api-client")
  const store = await import("./auth-store")
  const first = client.refresh()
  store.clearToken()
  const second = client.refresh()
  const rejected = expect(first).rejects.toMatchObject({ status: 401 })
  old.resolve(response("old")); await rejected
  expect(client.refresh()).toBe(second)
  expect(fetch).toHaveBeenCalledTimes(2)
  fresh.resolve(response("fresh")); await second
  expect(store.getToken()).toBe("fresh")
})
