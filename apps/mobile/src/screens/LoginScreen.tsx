import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useAuth } from "../context/AuthContext";

export default function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogin() {
    if (!email.trim() || !password) return;
    setError(null);
    setIsLoading(true);
    try {
      await login({ email: email.trim(), password });
    } catch {
      setError("E-mail ou senha inválidos.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.card}>
        <Text style={styles.title}>Control Finance</Text>
        <Text style={styles.subtitle}>Entre na sua conta</Text>

        <TextInput
          style={styles.input}
          placeholder="E-mail"
          placeholderTextColor="#8a9a91"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
          editable={!isLoading}
        />

        <TextInput
          style={styles.input}
          placeholder="Senha"
          placeholderTextColor="#8a9a91"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="password"
          editable={!isLoading}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          style={[styles.button, isLoading && styles.buttonDisabled]}
          onPress={handleLogin}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Entrar</Text>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f172a",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  card: {
    backgroundColor: "#1e293b",
    borderRadius: 20,
    padding: 28,
    gap: 16,
  },
  title: {
    color: "#f1f5f9",
    fontSize: 26,
    fontWeight: "800",
  },
  subtitle: {
    color: "#94a3b8",
    fontSize: 15,
    marginBottom: 4,
  },
  input: {
    backgroundColor: "#0f172a",
    borderColor: "#334155",
    borderRadius: 12,
    borderWidth: 1,
    color: "#f1f5f9",
    fontSize: 15,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  error: {
    color: "#f87171",
    fontSize: 14,
  },
  button: {
    alignItems: "center",
    backgroundColor: "#6741d9",
    borderRadius: 12,
    paddingVertical: 15,
    marginTop: 4,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
});
