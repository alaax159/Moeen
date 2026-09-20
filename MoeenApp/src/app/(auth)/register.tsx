import { router } from "expo-router";
import { useState } from "react";

import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from "react-native";

import AuthButton from "@/components/auth/AuthButton";
import AuthHeader from "@/components/auth/AuthHeader";
import AuthInput from "@/components/auth/AuthInput";
import { Colors, Spacing } from "@/constants/theme";
import { registerUser } from "@/firebase/auth";

export default function RegisterScreen() {
  const scheme = useColorScheme();
  const colors = scheme === "dark" ? Colors.dark : Colors.light;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleRegister() {
    const trimmedEmail = email.trim();

    if (!trimmedEmail || !password || !confirmPassword) {
      Alert.alert("Missing information", "Please fill in all fields.");
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert("Password mismatch", "Passwords do not match.");
      return;
    }

    if (password.length < 6) {
      Alert.alert("Weak password", "Password must be at least 6 characters.");
      return;
    }

    try {
      setLoading(true);

      // AuthContext syncs the backend user (and recovers if that fails)
      // for every sign-in path, so registration only needs to create the
      // Firebase account here.
      await registerUser(trimmedEmail, password);
    } catch (error) {
      Alert.alert("Registration failed", getRegisterErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.content}>
          <AuthHeader
            title="Create your account"
            subtitle="Get started with Moeen and keep your health information organized."
          />

          <AuthInput
            label="Email"
            icon="mail-outline"
            value={email}
            onChangeText={setEmail}
            placeholder="Enter your email"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
          />

          <AuthInput
            label="Password"
            icon="lock-closed-outline"
            value={password}
            onChangeText={setPassword}
            placeholder="Create a password"
            isPassword
            autoCapitalize="none"
            autoComplete="new-password"
          />

          <AuthInput
            label="Confirm password"
            icon="shield-checkmark-outline"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            placeholder="Confirm your password"
            isPassword
            autoCapitalize="none"
          />

          <Text style={[styles.passwordHint, { color: colors.textSecondary }]}>
            Password must contain at least 6 characters.
          </Text>

          <AuthButton
            title="Create account"
            onPress={handleRegister}
            loading={loading}
          />

          <View style={styles.footer}>
            <Text style={[styles.footerText, { color: colors.textSecondary }]}>
              Already have an account?{" "}
            </Text>

            <Pressable onPress={() => router.replace("/(auth)/login")}>
              <Text style={[styles.footerLink, { color: colors.primary }]}>
                Sign in
              </Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function getRegisterErrorMessage(error: unknown) {
  const code = (error as { code?: string } | null)?.code;

  switch (code) {
    case "auth/invalid-email":
      return "Please enter a valid email address.";

    case "auth/email-already-in-use":
      return "An account already exists with this email. Try signing in instead.";

    case "auth/weak-password":
      return "The password is too weak.";

    case "auth/operation-not-allowed":
      return "Email/password registration is not enabled.";

    case "auth/too-many-requests":
      return "Too many attempts. Please try again later.";

    default:
      return "Something went wrong. Please try again.";
  }
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },

  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
  },

  content: {
    width: "100%",
    maxWidth: 480,
    alignSelf: "center",
    paddingHorizontal: 22,
    paddingVertical: 34,
  },

  passwordHint: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: -4,
    marginBottom: Spacing.three,
  },

  footer: {
    marginTop: Spacing.four,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    flexWrap: "wrap",
  },

  footerText: {
    fontSize: 15,
  },

  footerLink: {
    fontSize: 15,
    fontWeight: "700",
  },
});