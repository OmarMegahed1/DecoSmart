import { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, ActivityIndicator, RefreshControl, StyleSheet } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { apiFetch } from "../../lib/api";
import { Feather } from "@expo/vector-icons";

type Project = {
  id: string;
  name: string;
  worldId?: string | null;
  status?: string | null;
  createdAt?: string | null;
};

const figmaPreviewImages = [
  "https://www.figma.com/api/mcp/asset/a10e18b8-75f6-417f-9204-211c579347ea",
  "https://www.figma.com/api/mcp/asset/58a03e55-46de-4912-be92-e1bbce39a474",
  "https://www.figma.com/api/mcp/asset/f5d5ae3e-4a49-4004-bc9c-3b813023c09f",
];

export default function GalleryScreen() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadProjects = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    setError(null);
    try {
      const res = await apiFetch("/api/projects");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || "Failed to load projects");
      }

      const payload = await res.json();
      setProjects((payload?.projects || []) as Project[]);
    } catch (e: any) {
      setError(e?.message || "Failed to load projects");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const formatDate = (date?: string | null) => {
    if (!date) return "Unknown";
    const parsed = new Date(date);
    if (Number.isNaN(parsed.getTime())) return "Unknown";
    return parsed.toLocaleDateString(undefined, {
      month: "short",
      day: "2-digit",
      year: "numeric",
    });
  };

  const statusMeta = (status?: string | null) => {
    const normalized = (status || "").toLowerCase();
    if (normalized === "done" || normalized === "completed") {
      return {
        label: "COMPLETED",
        bg: "#DCFCE7",
        color: "#166534",
      };
    }
    return {
      label: "IN PROGRESS",
      bg: "#FEF3C7",
      color: "#92400E",
    };
  };

  return (
    <View style={styles.screen}>
      <View style={styles.headerWrap}>
        <View style={styles.headerLeft}>
          <Image
            source={require("../../assets/Icon.svg")}
            style={styles.logoIcon}
            contentFit="contain"
          />
          <Text style={styles.heading}>MY PROJECTS</Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable style={styles.iconBtn}>
            <Feather name="search" size={16} color="#3A2F2A" />
          </Pressable>
        </View>
      </View>

      {loading ? (
        <View style={styles.centeredState}>
          <ActivityIndicator size="large" color="#c46b4a" />
        </View>
      ) : error ? (
        <View style={styles.centeredState}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable style={styles.retryBtn} onPress={() => loadProjects()}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <FlashList
          data={projects}
          numColumns={1}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadProjects(true)} />}
          renderItem={({ item, index }) => {
            const meta = statusMeta(item.status);
            return (
              <Pressable
                onPress={() => {
                  if (item.worldId) {
                    router.push({ pathname: "/model-view/[worldId]", params: { worldId: item.worldId } });
                  }
                }}
                style={styles.card}
              >
                <Image
                  source={{ uri: figmaPreviewImages[index % figmaPreviewImages.length] }}
                  style={styles.cardImage}
                  contentFit="cover"
                />
                <View style={styles.cardBody}>
                  <View style={[styles.statusPill, { backgroundColor: meta.bg }]}>
                    <Text style={[styles.statusPillText, { color: meta.color }]}>{meta.label}</Text>
                  </View>
                  <Text style={styles.cardTitle} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <View style={styles.cardBottomRow}>
                    <Text style={styles.cardHint} numberOfLines={1}>Created: {formatDate(item.createdAt)}</Text>
                    <View style={styles.avatarRow}>
                      <View style={styles.avatarBubble}><Text style={styles.avatarText}>JD</Text></View>
                      <View style={[styles.avatarBubble, styles.avatarBubbleAccent]}><Text style={styles.avatarTextAccent}>+1</Text></View>
                    </View>
                  </View>
                  <Pressable style={styles.moreBtn}><Feather name="more-vertical" size={14} color="#8b7e74" /></Pressable>
                </View>
              </Pressable>
            );
          }}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={
            <View style={styles.emptyStateWrap}>
              <Text style={styles.emptyStateTitle}>No projects yet</Text>
              <Text style={styles.emptyStateSubtitle}>Save from result screen to see projects here.</Text>
            </View>
          }
        />
      )}

      <Pressable style={styles.fab} onPress={() => router.push("/(tabs)" as any)}>
        <Feather name="plus" size={24} color="#fff" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#F5EFE6",
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  headerWrap: {
    marginBottom: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(196,106,74,0.1)",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  logoIcon: {
    width: 22,
    height: 22,
  },
  heading: {
    color: "#3A2F2A",
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  headerActions: {
    flexDirection: "row",
    gap: 8,
  },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.5)",
  },
  centeredState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  errorText: {
    color: "#b91c1c",
    textAlign: "center",
    fontSize: 13,
  },
  retryBtn: {
    backgroundColor: "#1e293b",
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
  },
  retryBtnText: {
    color: "#fff",
    fontWeight: "700",
  },
  listContent: {
    paddingBottom: 120,
  },
  card: {
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(196,106,74,0.05)",
    backgroundColor: "#ffffff",
    marginBottom: 16,
    width: "100%",
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 2,
    elevation: 1,
  },
  cardImage: {
    width: "100%",
    height: 210,
    backgroundColor: "#DDD6CE",
  },
  cardBody: {
    padding: 16,
    position: "relative",
  },
  statusPill: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginBottom: 8,
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
  cardTitle: {
    marginTop: 2,
    color: "#3A2F2A",
    fontWeight: "700",
    fontSize: 32,
    lineHeight: 40,
  },
  cardBottomRow: {
    marginTop: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardHint: {
    color: "#8B7E74",
    fontSize: 14,
  },
  avatarRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  avatarBubble: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#E2E8F0",
    borderWidth: 2,
    borderColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: -6,
  },
  avatarBubbleAccent: {
    backgroundColor: "#C46A4A",
  },
  avatarText: {
    color: "#3A2F2A",
    fontSize: 10,
    fontWeight: "700",
  },
  avatarTextAccent: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "700",
  },
  moreBtn: {
    position: "absolute",
    top: 16,
    right: 12,
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyStateWrap: {
    paddingVertical: 80,
    alignItems: "center",
  },
  emptyStateTitle: {
    color: "#3A2F2A",
    fontSize: 15,
    fontWeight: "700",
  },
  emptyStateSubtitle: {
    color: "#8B7E74",
    marginTop: 5,
    fontSize: 12,
  },
  fab: {
    position: "absolute",
    right: 20,
    bottom: 96,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#C46A4A",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 16,
    elevation: 6,
  },
});
