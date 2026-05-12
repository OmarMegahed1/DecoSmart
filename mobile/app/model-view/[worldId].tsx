import { useLocalSearchParams, useRouter } from "expo-router";
import { View, Text, Pressable, ActivityIndicator, StyleSheet, Platform, ScrollView } from "react-native";
import { useEffect, useMemo, useState } from "react";
import { apiFetch, formatApiErrorPayload } from "../../lib/api";
import { Feather } from "@expo/vector-icons";
import { API_URL } from "../../lib/auth-client";
import { Buffer } from "buffer";
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

export default function ModelViewScreen() {
  const router = useRouter();
  const { worldId } = useLocalSearchParams<{ worldId: string }>();
  const [loading, setLoading] = useState(true);
  const [world, setWorld] = useState<WorldResponse | null>(null);
  const [viewerLoadError, setViewerLoadError] = useState<string | null>(null);
  const [resolvedViewerSpzUrl, setResolvedViewerSpzUrl] = useState<string | null>(null);
  const [selectedQuality, setSelectedQuality] = useState<"100k" | "500k" | "full_res">("full_res");
  const [viewerDebugLogs, setViewerDebugLogs] = useState<string[]>([]);

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
          setViewerDebugLogs((prev) => [...prev.slice(-8), `World fetch error: ${message}`]);
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

      if (!proxiedSpzUrl) {
        setViewerLoadError("Missing proxied SPZ URL");
        return;
      }

      try {
        setViewerDebugLogs((prev) => [...prev.slice(-8), `Fetching proxied SPZ (${selectedQuality})...`]);
        const response = await apiFetch(`/api/worlds/${worldId}/spz/${selectedQuality}`);
        if (!response.ok) {
          const body = await safeReadJson(response);
          throw new Error(formatApiErrorPayload(body, `SPZ fetch failed (${response.status})`));
        }

        const rawBuffer = await response.arrayBuffer();
        const byteSize = rawBuffer.byteLength;
        setViewerDebugLogs((prev) => [...prev.slice(-8), `SPZ fetched: ${(byteSize / (1024 * 1024)).toFixed(2)} MB`]);

        if (cancelled) return;

        if (Platform.OS === "web") {
          const blob = new Blob([rawBuffer], { type: "application/octet-stream" });
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              if (typeof reader.result === "string") {
                resolve(reader.result);
                return;
              }
              reject(new Error("Failed to convert SPZ blob to data URL"));
            };
            reader.onerror = () => reject(reader.error || new Error("FileReader failed"));
            reader.readAsDataURL(blob);
          });
          setResolvedViewerSpzUrl(dataUrl);
        } else {
          const bytes = new Uint8Array(rawBuffer);
          const base64 = Buffer.from(bytes).toString("base64");
          setResolvedViewerSpzUrl(`data:application/octet-stream;base64,${base64}`);
        }
      } catch (e: any) {
        if (!cancelled) {
          const message = e?.message || "Unable to prepare 3D viewer asset";
          setViewerLoadError(message);
          setViewerDebugLogs((prev) => [...prev.slice(-8), `Viewer error: ${message}`]);
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

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator color="#c46b4a" />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={18} color="#3A2F2A" />
        </Pressable>
        <Text style={styles.title}>Project Viewer</Text>
        <View style={styles.backBtn} />
      </View>

      <View style={styles.viewerCard}>
        {resolvedViewerSpzUrl ? (
          <SplatViewer spzUrl={resolvedViewerSpzUrl} onLog={(msg) => setViewerDebugLogs((prev) => [...prev.slice(-10), `[viewer] ${msg}`])} />
        ) : viewerLoadError ? (
          <View style={styles.centeredMessage}>
            <Feather name="alert-triangle" size={28} color="#fca5a5" />
            <Text style={styles.errorText}>{viewerLoadError}</Text>
          </View>
        ) : (
          <View style={styles.centeredMessage}>
            <ActivityIndicator size="large" color="#c46b4a" />
            <Text style={styles.loadingText}>Preparing 3D asset...</Text>
          </View>
        )}
      </View>

      <ScrollView
        style={styles.bottomPanel}
        contentContainerStyle={styles.bottomContent}
        contentInsetAdjustmentBehavior="automatic"
      >
        <Text style={styles.metaLine}>Status: {world?.status ?? "unknown"}</Text>
        <Text style={styles.metaLine}>World ID: {worldId}</Text>

        <View style={styles.qualityRow}>
          {(["100k", "500k", "full_res"] as const).map((quality) => {
            const selected = selectedQuality === quality;
            return (
              <Pressable
                key={quality}
                style={[styles.qualityChip, selected && styles.qualityChipSelected]}
                onPress={() => setSelectedQuality(quality)}
              >
                <Text style={[styles.qualityText, selected && styles.qualityTextSelected]}>
                  {quality === "full_res" ? "Full" : quality}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.debugTitle}>Viewer Logs</Text>
        {viewerDebugLogs.slice(-6).map((line, idx) => (
          <Text key={`${line}-${idx}`} style={styles.debugLine}>{line}</Text>
        ))}
      </ScrollView>
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
  centeredMessage: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
  errorText: { color: "#b91c1c", fontSize: 13, textAlign: "center", paddingHorizontal: 20 },
  loadingText: { color: "#8B7E74", fontSize: 13 },
  bottomPanel: {
    maxHeight: 220,
    borderTopWidth: 1,
    borderTopColor: "rgba(196,106,74,0.12)",
    backgroundColor: "#F5EFE6",
  },
  bottomContent: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  metaLine: { color: "#6B5B50", fontSize: 12 },
  qualityRow: { flexDirection: "row", gap: 8 },
  qualityChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "rgba(196,106,74,0.2)",
  },
  qualityChipSelected: { backgroundColor: "#c46b4a" },
  qualityText: { color: "#6B5B50", fontSize: 12, fontWeight: "600" },
  qualityTextSelected: { color: "#fff" },
  debugTitle: { color: "#3A2F2A", fontSize: 12, fontWeight: "700", marginTop: 4 },
  debugLine: { color: "#8B7E74", fontSize: 10 },
});
