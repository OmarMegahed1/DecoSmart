import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
  TextInput,
  Alert,
} from "react-native";
import { FlashList } from "@shopify/flash-list";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { apiFetch, readApiErrorMessage } from "../../lib/api";
import { Feather } from "@expo/vector-icons";

type Project = {
  id: string;
  name: string;
  worldId?: string | null;
  status?: string | null;
  caption?: string | null;
  createdAt?: string | null;
};

const SEARCH_DEBOUNCE_MS = 280;

const shortDateFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "2-digit",
  year: "numeric",
});

function formatProjectDate(date?: string | null): string {
  if (!date) return "Unknown";
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return "Unknown";
  return shortDateFormatter.format(parsed);
}

type GalleryProjectCardProps = {
  item: Project;
  formattedDate: string;
  onOpenWorld: (worldId: string) => void;
  onRequestDelete: (item: Project) => void;
};

const GalleryProjectCard = memo(function GalleryProjectCard({
  item,
  formattedDate,
  onOpenWorld,
  onRequestDelete,
}: GalleryProjectCardProps) {
  const handleOpen = useCallback(() => {
    if (item.worldId) onOpenWorld(item.worldId);
  }, [item.worldId, onOpenWorld]);

  const handleDeletePress = useCallback(() => {
    onRequestDelete(item);
  }, [item, onRequestDelete]);

  return (
    <View style={styles.card}>
      <Pressable
        onPress={handleOpen}
        disabled={!item.worldId}
        style={({ pressed }) => [
          styles.cardPressable,
          !item.worldId && styles.cardPressableDisabled,
          pressed && item.worldId && styles.cardPressablePressed,
        ]}
        accessibilityRole="button"
        accessibilityState={{ disabled: !item.worldId }}
        accessibilityLabel={item.worldId ? `Open project ${item.name}` : item.name}
      >
        <View style={styles.cardInner}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={styles.cardHint} numberOfLines={1}>
            Created: {formattedDate}
          </Text>
        </View>
      </Pressable>
      <Pressable
        style={styles.deleteBtn}
        onPress={handleDeletePress}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={`Delete project ${item.name}`}
      >
        <Feather name="trash-2" size={18} color="#b45309" />
      </Pressable>
    </View>
  );
});

export default function GalleryScreen() {
  const { push } = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const searchInputRef = useRef<TextInput>(null);

  const openWorld = useCallback(
    (worldId: string) => {
      push({ pathname: "/model-view/[worldId]", params: { worldId } });
    },
    [push]
  );

  const loadProjects = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    setError(null);
    try {
      const res = await apiFetch("/api/projects");
      if (!res.ok) {
        throw new Error(await readApiErrorMessage(res, "Failed to load projects"));
      }

      const payload = await res.json();
      setProjects((payload?.projects || []) as Project[]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load projects");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    const id = setTimeout(() => {
      setDebouncedQuery(query.trim().toLowerCase());
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [query]);

  useEffect(() => {
    if (!searchOpen) return;
    const frame = requestAnimationFrame(() => {
      searchInputRef.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [searchOpen]);

  const filteredProjects = useMemo(() => {
    if (!debouncedQuery) return projects;
    return projects.filter((p) => {
      const text = `${p.name}\n${p.caption ?? ""}`.toLowerCase();
      return text.includes(debouncedQuery);
    });
  }, [projects, debouncedQuery]);

  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    setQuery("");
    setDebouncedQuery("");
  }, []);

  const requestDeleteProject = useCallback((project: Project) => {
    Alert.alert(
      "Delete project",
      `Remove "${project.name}"? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              const res = await apiFetch(`/api/projects/${project.id}`, { method: "DELETE" });
              if (!res.ok) {
                throw new Error(await readApiErrorMessage(res, "Failed to delete project"));
              }
              setProjects((prev) => prev.filter((p) => p.id !== project.id));
            } catch (e: unknown) {
              const message = e instanceof Error ? e.message : "Failed to delete project";
              Alert.alert("Could not delete", message);
            }
          },
        },
      ]
    );
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: Project }) => (
      <GalleryProjectCard
        item={item}
        formattedDate={formatProjectDate(item.createdAt)}
        onOpenWorld={openWorld}
        onRequestDelete={requestDeleteProject}
      />
    ),
    [openWorld, requestDeleteProject]
  );

  const keyExtractor = useCallback((item: Project) => item.id, []);

  const listEmpty = useMemo(() => {
    if (projects.length === 0) {
      return (
        <View style={styles.emptyStateWrap}>
          <Text style={styles.emptyStateTitle}>No projects yet</Text>
          <Text style={styles.emptyStateSubtitle}>Save from result screen to see projects here.</Text>
        </View>
      );
    }
    if (filteredProjects.length === 0 && debouncedQuery) {
      return (
        <View style={styles.emptyStateWrap}>
          <Text style={styles.emptyStateTitle}>No matching projects</Text>
          <Text style={styles.emptyStateSubtitle}>Try a different search term.</Text>
        </View>
      );
    }
    return null;
  }, [projects.length, filteredProjects.length, debouncedQuery]);

  return (
    <View style={styles.screen}>
      {searchOpen ? (
        <View style={styles.searchHeaderRow}>
          <Pressable
            onPress={closeSearch}
            style={styles.searchBackBtn}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Close search"
          >
            <Feather name="arrow-left" size={20} color="#3A2F2A" />
          </Pressable>
          <TextInput
            ref={searchInputRef}
            value={query}
            onChangeText={setQuery}
            placeholder="Search by name or caption"
            placeholderTextColor="#8B7E74"
            style={styles.searchInput}
            accessibilityLabel="Search projects"
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
            clearButtonMode="never"
          />
          {query.length > 0 ? (
            <Pressable
              onPress={() => setQuery("")}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Clear search text"
            >
              <Feather name="x-circle" size={20} color="#8B7E74" />
            </Pressable>
          ) : null}
        </View>
      ) : (
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
            <Pressable
              style={styles.iconBtn}
              hitSlop={8}
              onPress={() => setSearchOpen(true)}
              accessibilityRole="button"
              accessibilityLabel="Open project search"
            >
              <Feather name="search" size={16} color="#3A2F2A" />
            </Pressable>
          </View>
        </View>
      )}

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
          data={filteredProjects}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          style={styles.listFlex}
          contentContainerStyle={styles.listContent}
          contentInsetAdjustmentBehavior="automatic"
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadProjects(true)} />}
          ListEmptyComponent={listEmpty}
        />
      )}

      <Pressable style={styles.fab} onPress={() => push("/(tabs)" as any)} hitSlop={4}>
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
  listFlex: {
    flex: 1,
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
  searchHeaderRow: {
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(196,106,74,0.1)",
  },
  searchBackBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.5)",
  },
  searchInput: {
    flex: 1,
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.85)",
    color: "#3A2F2A",
    fontSize: 16,
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
    paddingBottom: 88,
  },
  card: {
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(196,106,74,0.05)",
    backgroundColor: "#ffffff",
    marginBottom: 16,
    width: "100%",
    position: "relative",
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 2,
    elevation: 1,
  },
  cardPressable: {
    paddingRight: 44,
  },
  cardPressableDisabled: {
    opacity: 0.55,
  },
  cardPressablePressed: {
    opacity: 0.92,
  },
  cardInner: {
    paddingVertical: 16,
    paddingLeft: 16,
    paddingRight: 8,
  },
  cardTitle: {
    color: "#3A2F2A",
    fontWeight: "700",
    fontSize: 22,
    lineHeight: 28,
  },
  cardHint: {
    color: "#8B7E74",
    fontSize: 14,
    marginTop: 6,
  },
  deleteBtn: {
    position: "absolute",
    top: 14,
    right: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(180, 83, 9, 0.08)",
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
    bottom: 12,
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
