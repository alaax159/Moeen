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
import { loginUser, resetPassword } from "@/firebase/auth";

export default function LoginScreen() {
  const scheme = useColorScheme();
  const colors = scheme === "dark" ? Colors.dark : Colors.light;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    const trimmedEmail = email.trim();

    if (!trimmedEmail || !password) {
      Alert.alert(
        "Missing information",
        "Please enter your email and password.",
      );
      return;
    }

    try {
      setLoading(true);

      await loginUser(trimmedEmail, password);
    } catch (error: any) {
      Alert.alert("Login failed", getLoginErrorMessage(error?.code));
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotPassword() {
    const trimmedEmail = email.trim();

    if (!trimmedEmail) {
      Alert.alert(
        "Enter your email",
        "Please enter your email address first, then tap Forgot password.",
      );
      return;
    }

    try {
      await resetPassword(trimmedEmail);

      Alert.alert(
        "Check your email",
        "A password reset link has been sent to your email.",
      );
    } catch (error: any) {
      Alert.alert("Reset failed", getResetPasswordErrorMessage(error?.code));
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
            title="Welcome back"
            subtitle="Sign in to continue managing your health with Moeen."
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

          <View style={styles.passwordSection}>
            <AuthInput
              label="Password"
              icon="lock-closed-outline"
              value={password}
              onChangeText={setPassword}
              placeholder="Enter your password"
              isPassword
              autoCapitalize="none"
              autoComplete="password"
            />

            <Pressable
              onPress={handleForgotPassword}
              style={styles.forgotPasswordButton}
            >
              <Text
                style={[styles.forgotPasswordText, { color: colors.primary }]}
              >
                Forgot password?
              </Text>
            </Pressable>
          </View>

          <AuthButton title="Sign in" onPress={handleLogin} loading={loading} />

          <View style={styles.footer}>
            <Text style={[styles.footerText, { color: colors.textSecondary }]}>
              {"Don't have an account? "}
            </Text>

            <Pressable onPress={() => router.push("/(auth)/register")}>
              <Text style={[styles.footerLink, { color: colors.primary }]}>
                Create account
              </Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function getLoginErrorMessage(code?: string) {
  switch (code) {
    case "auth/invalid-email":
      return "Please enter a valid email address.";

    case "auth/invalid-credential":
      return "Incorrect email or password.";

    case "auth/too-many-requests":
      return "Too many attempts. Please try again later.";

    default:
      return "Something went wrong. Please try again.";
  }
}

function getResetPasswordErrorMessage(code?: string) {
  switch (code) {
    case "auth/invalid-email":
      return "Please enter a valid email address.";

    case "auth/user-not-found":
      return "No account was found with this email.";

    case "auth/too-many-requests":
      return "Too many requests. Please try again later.";

    default:
      return "Unable to send the reset email. Please try again.";
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

  passwordSection: {
    marginBottom: Spacing.three,
  },

  forgotPasswordButton: {
    alignSelf: "flex-end",
    marginTop: -8,
  },

  forgotPasswordText: {
    fontSize: 14,
    fontWeight: "600",
  },

  footer: {
    marginTop: Spacing.four,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
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
