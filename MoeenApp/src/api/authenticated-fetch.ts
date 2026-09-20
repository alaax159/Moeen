import { auth } from "@/firebase/config";

type FetchInput = Parameters<typeof fetch>[0];
type FetchInit = Parameters<typeof fetch>[1];

export async function authenticatedFetch(
  input: FetchInput,
  init: FetchInit = {},
) {
  const user = auth.currentUser;

  if (!user) {
    throw new Error("User is not authenticated.");
  }

  const token = await user.getIdToken();

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);

  return fetch(input, {
    ...init,
    headers,
  });
}
