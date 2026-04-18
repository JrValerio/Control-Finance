import { StatusBar } from "expo-status-bar";
import { SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";

export default function App() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Text style={styles.eyebrow}>Control Finance Mobile</Text>
          <Text style={styles.title}>MVP mobile do monorepo pronto para evoluir.</Text>
          <Text style={styles.subtitle}>
            A base inicial esta preparada para iOS e Android com Expo managed, EAS e espaco
            reservado para a sessao mobile via bearer token.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Escopo do primeiro corte</Text>
          <Text style={styles.cardText}>Login, dashboard, transacoes, cartoes, contas e perfil.</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Monorepo preservado</Text>
          <Text style={styles.cardText}>
            `apps/mobile` entra ao lado de `apps/web` e `apps/api`, sem quebrar a estrutura atual.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Proximo passo tecnico</Text>
          <Text style={styles.cardText}>
            Adicionar endpoints de auth mobile que retornem tokens no body e guardar o refresh com
            armazenamento seguro no dispositivo.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#f5efe3",
  },
  content: {
    gap: 16,
    paddingHorizontal: 20,
    paddingVertical: 24,
  },
  hero: {
    backgroundColor: "#102820",
    borderRadius: 28,
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 24,
    shadowColor: "#102820",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
  },
  eyebrow: {
    color: "#d7c18a",
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 1.1,
    textTransform: "uppercase",
  },
  title: {
    color: "#f8f4ea",
    fontSize: 30,
    fontWeight: "800",
    lineHeight: 36,
  },
  subtitle: {
    color: "#dfe7df",
    fontSize: 16,
    lineHeight: 24,
  },
  card: {
    backgroundColor: "#fffaf0",
    borderColor: "#e1d6bf",
    borderRadius: 22,
    borderWidth: 1,
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 18,
  },
  cardTitle: {
    color: "#1f2a24",
    fontSize: 18,
    fontWeight: "700",
  },
  cardText: {
    color: "#4b5a51",
    fontSize: 15,
    lineHeight: 22,
  },
});
