import { useLocalSearchParams, useRouter } from "expo-router";
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  Platform,
  ScrollView,
  useWindowDimensions,
} from "react-native";
import { useEffect, useMemo, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { apiFetch, formatApiErrorPayload } from "../../lib/api";
import { defaultSplatQuality, isSpzTooLargeForNative, spzBufferToViewerUrl, type SplatQuality } from "../../lib/spzViewerAsset";
import { Feather } from "@expo/vector-icons";
import { API_URL } from "../../lib/auth-client";
import SplatViewer from "../../components/viewer/SplatViewer";

async function safeReadJson(res: Response): Promise<any | null> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

type WorldResponse = {
  id?: string;
  world_id?: string;
  status?: string;
  assets?: {
    caption?: string;
    splats?: {
      spz_urls?: {
        "100k"?: string;
        "500k"?: string;
        full_res?: string;
      };
    };
  };
};

const SPLAT_FS_HOST_ID = "model-view-splat-fs-host";

export default function ModelViewScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const compact = width < 390;
  const { worldId } = useLocalSearchParams<{ worldId: string }>();
  const [loading, setLoading] = useState(true);
  const [world, setWorld] = useState<WorldResponse | null>(null);
  const [viewerLoadError, setViewerLoadError] = useState<string | null>(null);
  const [resolvedViewerSpzUrl, setResolvedViewerSpzUrl] = useState<string | null>(null);
  const [selectedQuality, setSelectedQuality] = useState<SplatQuality>(() => defaultSplatQuality());
  const [isFullscreen, setIsFullscreen] = useState(false);

  const spzUrl = useMemo(() => {
    return world?.assets?.splats?.spz_urls?.[selectedQuality] ?? null;
  }, [world, selectedQuality]);

  const proxiedSpzUrl = useMemo(() => {
    if (!worldId) return null;
    return `${API_URL}/api/worlds/${worldId}/spz/${selectedQuality}`;
  }, [worldId, selectedQuality]);

  useEffect(() => {
    const run = async () => {
      try {
        const res = await apiFetch(`/api/worlds/${worldId}`);
        if (res.ok) {
          const data = await safeReadJson(res);
          if (data) {
            setWorld(data);
          }
        } else {
          const payload = await safeReadJson(res);
          const message = formatApiErrorPayload(payload, `World request failed (${res.status})`);
          setViewerLoadError(message);
        }
      } finally {
        setLoading(false);
      }
    };
    if (worldId) run();
  }, [worldId]);

  useEffect(() => {
    let cancelled = false;

    async function resolveViewerAsset() {
      setViewerLoadError(null);
      setResolvedViewerSpzUrl(null);

      if (!proxiedSpzUrl || !worldId) {
        setViewerLoadError("Missing proxied SPZ URL");
        return;
      }

      try {
        const order: SplatQuality[] = ["full_res", "500k", "100k"];
        const candidates: SplatQuality[] = [
          selectedQuality,
          ...order.filter((q) => q !== selectedQuality),
        ];

        let rawBuffer: ArrayBuffer | null = null;
        let usedQuality: SplatQuality | null = null;
        let lastErr = "";

        for (const quality of candidates) {
          try {
            const attempt = await apiFetch(`/api/worlds/${worldId}/spz/${quality}`);
            if (!attempt.ok) {
              lastErr = `HTTP ${attempt.status}`;
              continue;
            }
            const buf = await attempt.arrayBuffer();
            if (isSpzTooLargeForNative(buf.byteLength)) {
              lastErr = `SPZ too large on mobile (${Math.round(buf.byteLength / 1e6)} MB) — try 500k or 100k.`;
              continue;
            }
            rawBuffer = buf;
            usedQuality = quality;
            break;
          } catch (e: unknown) {
            lastErr = e instanceof Error ? e.message : "fetch failed";
          }
        }

        if (!rawBuffer || !usedQuality) {
          throw new Error(lastErr || "Could not download SPZ");
        }

        if (cancelled) return;

        const viewerUrl = await spzBufferToViewerUrl(`${worldId}-${usedQuality}`, rawBuffer);
        if (!cancelled) setResolvedViewerSpzUrl(viewerUrl);
      } catch (e: unknown) {
        if (!cancelled) {
          const message = e instanceof Error ? e.message : "Unable to prepare 3D viewer asset";
          setViewerLoadError(message);
        }
      }
    }

    if (worldId) {
      resolveViewerAsset();
    }

    return () => {
      cancelled = true;
    };
  }, [worldId, proxiedSpzUrl, selectedQuality]);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    const el =
      document.getElementById(SPLAT_FS_HOST_ID) ||
      document.querySelector(`[data-testid="${SPLAT_FS_HOST_ID}"]`);
    if (!el) return;
    if (isFullscreen) {
      (el as HTMLElement).requestFullscreen?.().catch(() => {});
    } else if (document.fullscreenElement === el) {
      document.exitFullscreen?.().catch(() => {});
    }
  }, [isFullscreen]);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    const onFs = () => {
      if (!document.fullscreenElement) {
        setIsFullscreen(false);
      }
    };
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator color="#c46b4a" />
      </View>
    );
  }

  const viewerMinHeight = isFullscreen ? undefined : 320;

  return (
    <View style={styles.screen}>
      <StatusBar style={isFullscreen ? "light" : "dark"} hidden={isFullscreen} />
      {!isFullscreen && (
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Feather name="arrow-left" size={18} color="#3A2F2A" />
          </Pressable>
          <Text style={[styles.title, compact && styles.titleCompact]}>Project Viewer</Text>
          <View style={styles.backBtn} />
        </View>
      )}

      <View
        nativeID={SPLAT_FS_HOST_ID}
        testID={SPLAT_FS_HOST_ID}
        style={[
          styles.viewerCard,
          isFullscreen && styles.viewerCardFullscreen,
          viewerMinHeight != null ? { minHeight: viewerMinHeight } : null,
        ]}
      >
        {resolvedViewerSpzUrl ? (
          <SplatViewer
            key={resolvedViewerSpzUrl}
            spzUrl={resolvedViewerSpzUrl}
            immersive={isFullscreen}
            onToggleImmersive={() => setIsFullscreen((v) => !v)}
            onError={(msg) => setViewerLoadError(msg)}
          />
        ) : viewerLoadError ? (
          <View style={styles.centeredMessage}>
            <Feather name="alert-triangle" size={28} color="#fca5a5" />
            <Text style={[styles.errorText, compact && styles.errorTextCompact]}>{viewerLoadError}</Text>
          </View>
        ) : (
          <View style={styles.centeredMessage}>
            <ActivityIndicator size="large" color="#c46b4a" />
            <Text style={[styles.loadingText, compact && styles.loadingTextCompact]}>Preparing 3D asset...</Text>
          </View>
        )}
      </View>

      {!isFullscreen && (
        <ScrollView
          style={styles.bottomPanel}
          contentContainerStyle={styles.bottomContent}
          contentInsetAdjustmentBehavior="automatic"
        >
          <Text style={[styles.metaLine, compact && styles.metaLineCompact]}>
            Status: {world?.status ?? "unknown"}
          </Text>

          <View style={styles.qualityRow}>
            {(["100k", "500k", "full_res"] as const).map((quality) => {
              const selected = selectedQuality === quality;
              return (
                <Pressable
                  key={quality}
                  style={[
                    styles.qualityChip,
                    compact && styles.qualityChipCompact,
                    selected && styles.qualityChipSelected,
                  ]}
                  onPress={() => setSelectedQuality(quality)}
                >
                  <Text style={[styles.qualityText, selected && styles.qualityTextSelected]}>
                    {quality === "full_res" ? "Full" : quality}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F5EFE6" },
  loadingWrap: { flex: 1, backgroundColor: "#F5EFE6", alignItems: "center", justifyContent: "center" },
  header: {
    height: 56,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(196,106,74,0.12)",
  },
  backBtn: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  title: { color: "#3A2F2A", fontSize: 16, fontWeight: "700" },
  titleCompact: { fontSize: 14 },
  viewerCard: {
    flex: 1,
    margin: 12,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(196,106,74,0.12)",
    backgroundColor: "#ffffff",
    minHeight: 320,
  },
  viewerCardFullscreen: {
    flex: 1,
    margin: 0,
    borderRadius: 0,
    borderWidth: 0,
    minHeight: undefined,
    backgroundColor: "#0c0a09",
  },
  centeredMessage: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
  errorText: { color: "#b91c1c", fontSize: 13, textAlign: "center", paddingHorizontal: 20 },
  errorTextCompact: { fontSize: 12 },
  loadingText: { color: "#8B7E74", fontSize: 13 },
  loadingTextCompact: { fontSize: 12 },
  bottomPanel: {
    maxHeight: 140,
    borderTopWidth: 1,
    borderTopColor: "rgba(196,106,74,0.12)",
    backgroundColor: "#F5EFE6",
  },
  bottomContent: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  metaLine: { color: "#6B5B50", fontSize: 12 },
  metaLineCompact: { fontSize: 11 },
  qualityRow: { flexDirection: "row", gap: 8 },
  qualityChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "rgba(196,106,74,0.2)",
  },
  qualityChipCompact: { paddingHorizontal: 10, paddingVertical: 5 },
  qualityChipSelected: { backgroundColor: "#c46b4a" },
  qualityText: { color: "#6B5B50", fontSize: 12, fontWeight: "600" },
  qualityTextCompact: { fontSize: 11 },
  qualityTextSelected: { color: "#fff" },
});
