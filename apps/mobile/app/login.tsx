import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Linking, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { useAuth } from "../lib/auth-context";
import { colors, fontSize, spacing } from "../lib/theme";

const WEB_APP_URL = process.env.EXPO_PUBLIC_APP_URL ?? "https://rental-properties-platform-web.vercel.app";

export default function LoginScreen() {
  const router = useRouter();
  const { authMessage, clearAuthMessage, sendMagicLink, session } = useAuth();
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (session) {
      router.replace("/(tabs)");
    }
  }, [router, session]);

  const handleSubmit = async () => {
    setSubmitting(true);
    await sendMagicLink(email);
    setSubmitting(false);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <View>
          <Text style={styles.title}>Domus Mobile</Text>
          <Text style={styles.subtitle}>Sign in with your Domus account to access your workspace.</Text>
        </View>

        <Card>
          <Input
            autoCapitalize="none"
            keyboardType="email-address"
            label="Email"
            onChangeText={setEmail}
            placeholder="you@example.com"
            value={email}
          />

          <View style={styles.buttonStack}>
            <Button disabled={submitting} onPress={() => void handleSubmit()}>
              {submitting ? "Sending..." : "Send Magic Link"}
            </Button>
            <Button onPress={() => void Linking.openURL(`${WEB_APP_URL}/login`)} variant="secondary">
              Open Web Login
            </Button>
          </View>

          {authMessage ? (
            <View style={styles.messageWrap}>
              <Text style={styles.messageText}>{authMessage}</Text>
              <Button onPress={clearAuthMessage} variant="secondary">
                Dismiss
              </Button>
            </View>
          ) : null}
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: colors.background,
    flex: 1,
  },
  container: {
    gap: spacing.lg,
    padding: spacing.lg,
  },
  title: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: "800",
    marginBottom: spacing.xs,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: fontSize.md,
    lineHeight: 22,
  },
  buttonStack: {
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  messageWrap: {
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  messageText: {
    color: colors.info,
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
});
