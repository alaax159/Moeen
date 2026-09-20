import { onAuthStateChanged, type User } from "firebase/auth";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";

import { AuthApiError, syncUser } from "@/features/auth/api";
import { reconcileEmergencyCredentialOwner } from "@/features/emergency-support/credential-store";
import { auth } from "@/firebase/config";
import { logoutUser } from "@/firebase/auth";

type AuthContextType = {
  user: User | null;
  loading: boolean;
  authError: string | null;
  clearAuthError: () => void;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

type AuthProviderProps = {
  children: ReactNode;
};

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      try {
        await reconcileEmergencyCredentialOwner(currentUser?.uid ?? null);
      } catch {
        // Credential reads still verify ownership before returning a token.
        // Authentication must not be blocked by a secure-storage failure.
      }

      if (!currentUser) {
        setUser(null);
        setLoading(false);
        return;
      }

      // A Firebase session only counts as authenticated once the backend
      // confirms a matching user record exists. This runs for every
      // sign-in path (login, register, and sessions restored on launch),
      // so a Firebase account left without a backend row never stays
      // silently "logged in".
      setLoading(true);

      try {
        await syncUser();
        setAuthError(null);
        setUser(currentUser);
      } catch (error) {
        setUser(null);
        setAuthError(
          error instanceof AuthApiError
            ? error.message
            : "Unable to sync your account. Please sign in again.",
        );
        await logoutUser();
      } finally {
        setLoading(false);
      }
    });

    return unsubscribe;
  }, []);

  return (
    <AuthContext
      value={{
        user,
        loading,
        authError,
        clearAuthError: () => setAuthError(null),
      }}
    >
      {children}
    </AuthContext>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (context === undefined) {
    throw new Error("useAuth must be used inside AuthProvider");
  }

  return context;
}
