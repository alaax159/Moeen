import { Redirect } from "expo-router";

import { useAuth } from "@/context/AuthContext";

/**
 * Root entry point for a normal app launch.
 *
 * Without this route the path "/" has no match, so the router falls back to
 * the first registered root screen — the public responder page "/e" — which
 * is never a valid destination for a normal launch. Signed-in users are sent
 * to onboarding, which itself forwards to the tabs once the health profile is
 * complete, so the existing auth and onboarding behaviour is preserved.
 */
export default function Index() {
  const { user, loading } = useAuth();

  if (loading) return null;

  return (
    <Redirect href={user ? "/(onboarding)/personal-info" : "/(auth)/login"} />
  );
}
