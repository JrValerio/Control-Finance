import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, SafeAreaView, StyleSheet, Text, View } from "react-native";
import { AuthProvider, useAuth } from "./src/context/AuthContext";
import LoginScreen from "./src/screens/LoginScreen";

function RootNavigator() {
  const { isInitializing, isAuthenticated } = useAuth();

  if (isInitializing) {
    return (
      <View style={styles.splash}>
        <ActivityIndicator size="large" color="#6741d9" />
      </View>
    );
  }

  if (!isAuthenticated) {
    return <LoginScreen />;
  }

  return (
    <SafeAreaView style={styles.dashboard}>
      <StatusBar style="light" />
      <Text style={styles.dashboardText}>Dashboard — em breve</Text>
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <RootNavigator />
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    backgroundColor: "#0f172a",
    alignItems: "center",
    justifyContent: "center",
  },
  dashboard: {
    flex: 1,
    backgroundColor: "#0f172a",
    alignItems: "center",
    justifyContent: "center",
  },
  dashboardText: {
    color: "#94a3b8",
    fontSize: 16,
  },
});
