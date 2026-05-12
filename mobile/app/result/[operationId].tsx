import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { apiFetch, formatApiErrorPayload } from "../../lib/api";
import { API_URL } from "../../lib/auth-client";
import { Feather } from "@expo/vector-icons";
import { Buffer } from "buffer";
import SplatViewer from "../../components/viewer/SplatViewer";

type OperationProgress = {
  description?: string;
};

type OperationMetadata = {
  progress?: OperationProgress;
  world_id?: string;
};

type World = {
  id: string;
  world_id?: string;
  status?: string;
  world_marble_url?: string;
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

type Operation = {
  operation_id: string;
  done: boolean;
  error?: { message?: string };
  metadata?: OperationMetadata;
  response?: World | { world?: World };
};

type Stage = "polling" | "done" | "error";

const POLL_MS = 5000;

const CREAM = "#F5EFE6";
const TEXT_MAIN = "#3A2F2A";
const TEXT_SECONDARY = "#6b705c";
const TEXT_MUTED = "#8B7E74";
const BORDER_SUBTLE = "rgba(107,112,92,0.22)";
const SURFACE_CARD = "#ffffff";

export default function ResultScreen() {
  const { operationId } = useLocalSearchParams<{ operationId: string }>();
  const router = useRouter();

  const [stage, setStage] = useState<Stage>("polling");
  const [statusText, setStatusText] = useState("Starting generation...");
  const [errorMsg, setErrorMsg] = useState("");
  const [world, setWorld] = useState<World | null>(null);
  const [effectiveWorldId, setEffectiveWorldId] = useState<string | null>(null);
  const [selectedQuality, setSelectedQuality] = useState<"100k" | "500k" | "full_res">("full_res");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [resolvedViewerSpzUrl, setResolvedViewerSpzUrl] = useState<string | null>(null);
  const [viewerLoadError, setViewerLoadError] = useState<string | null>(null);
  const [viewerDebugLogs, setViewerDebugLogs] = useState<string[]>([]);
  const [spzFetchBytes, setSpzFetchBytes] = useState<number | null>(null);
  const [spzProxyQuality, setSpzProxyQuality] = useState<string | null>(null);
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [isSavingProject, setIsSavingProject] = useState(false);
  const [saveStatusText, setSaveStatusText] = useState<string | null>(null);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const spzUrl = useMemo(() => {
    return world?.assets?.splats?.spz_urls?.[selectedQuality] ?? null;
  }, [world, selectedQuality]);

  const proxiedSpzUrl = useMemo(() => {
    if (!effectiveWorldId) return null;
    return `${API_URL}/api/worlds/${effectiveWorldId}/spz/${selectedQuality}?operationId=${encodeURIComponent(String(operationId || ""))}`;
  }, [effectiveWorldId, selectedQuality, operationId]);

  useEffect(() => {
    let cancelled = false;
    let objectUrlToRevoke: string | null = null;

    async function resolveViewerAsset() {
      setViewerLoadError(null);
      setResolvedViewerSpzUrl(null);
      setSpzFetchBytes(null);
      setSpzProxyQuality(null);

      // Prefetch through authenticated API and feed a local URL to Spark.
      // This avoids cookie/CORS issues when Spark performs internal fetches.
      if (proxiedSpzUrl) {
        try {
          const order: Array<"full_res" | "500k" | "100k"> = ["full_res", "500k", "100k"];
          const candidates = [selectedQuality, ...order.filter((q) => q !== selectedQuality)];

          let successRes: Response | null = null;
          let usedQuality: string | null = null;
          let lastStatus: number | null = null;
          let lastErrorDetails: string | null = null;

          for (const quality of candidates) {
            setViewerDebugLogs((prev) => [...prev, `Fetching proxied SPZ (${quality})...`]);
            try {
              const attempt = await apiFetch(
                `/api/worlds/${effectiveWorldId}/spz/${quality}?operationId=${encodeURIComponent(String(operationId || ""))}`
              );
              if (attempt.ok) {
                successRes = attempt;
                usedQuality = quality;
                break;
              }
              lastStatus = attempt.status;
              try {
                const errBody = await attempt.json();
                const details = formatApiErrorPayload(errBody, `Proxy failed (${attempt.status})`);
                lastErrorDetails = `(${attempt.status}) ${details}`;
                setViewerDebugLogs((prev) => [...prev, `Proxy ${quality} failed: ${details}`]);
              } catch {
                try {
                  const details = await attempt.text();
                  lastErrorDetails = `(${attempt.status}) ${details}`;
                  setViewerDebugLogs((prev) => [...prev, `Proxy ${quality} failed: ${details || "no body"}`]);
                } catch {
                  lastErrorDetails = `(${attempt.status}) no error body`;
                }
              }
            } catch (attemptError: any) {
              lastErrorDetails = attemptError?.message || "Failed to fetch";
              setViewerDebugLogs((prev) => [...prev, `Proxy ${quality} network error: ${lastErrorDetails}`]);
            }
          }

          if (!successRes) {
            if (spzUrl) {
              setViewerDebugLogs((prev) => [...prev, "Proxy unavailable, falling back to direct SPZ URL."]);
              setResolvedViewerSpzUrl(spzUrl);
              return;
            }
            throw new Error(
              `Failed to load SPZ (${lastStatus ?? "unknown"})${lastErrorDetails ? ` - ${lastErrorDetails}` : ""}`
            );
          }

          const selectedProxyQuality = successRes.headers.get("x-spz-quality") || usedQuality;
          if (selectedProxyQuality) {
            setSpzProxyQuality(selectedProxyQuality);
            setViewerDebugLogs((prev) => [...prev, `Proxy selected quality: ${selectedProxyQuality}`]);
          }

          const rawBuffer = await successRes.arrayBuffer();
          const byteSize = rawBuffer.byteLength;
          setSpzFetchBytes(byteSize);
          if (!cancelled) {
            setViewerDebugLogs((prev) => [...prev, `SPZ fetched: ${(byteSize / (1024 * 1024)).toFixed(2)} MB`]);

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
              setViewerDebugLogs((prev) => [...prev, "Web SPZ converted to data URL."]);
            } else {
              // Native WebView cannot rely on app cookies for internal module fetches.
              // Provide a self-contained data URL so Spark loads from local bytes.
              const bytes = new Uint8Array(rawBuffer);
              const base64 = Buffer.from(bytes).toString("base64");
              setResolvedViewerSpzUrl(`data:application/octet-stream;base64,${base64}`);
              setViewerDebugLogs((prev) => [...prev, "Native SPZ converted to data URL."]);
            }
          }
          return;
        } catch (e: any) {
          if (!cancelled) {
            const message = e?.message || "Unable to prepare 3D asset for rendering";
            setViewerDebugLogs((prev) => [...prev, `SPZ fetch error: ${message}`]);
            if (selectedQuality !== "100k") {
              setViewerDebugLogs((prev) => [...prev, `Auto-fallback: switching quality from ${selectedQuality} to 100k.`]);
              setSelectedQuality("100k");
              return;
            }
            setViewerLoadError(message);
          }
          return;
        }
      }

      // Final fallback: use direct URL.
      if (!spzUrl) {
        setViewerLoadError("No SPZ URL available from world response or proxy");
        setViewerDebugLogs((prev) => [...prev, "No SPZ URL available from world response or proxy."]);
        return;
      }

      setViewerDebugLogs((prev) => [...prev, "Proxy URL unavailable, using direct SPZ URL."]);
      setResolvedViewerSpzUrl(spzUrl);
    }

    resolveViewerAsset();

    return () => {
      cancelled = true;
      if (objectUrlToRevoke) {
        URL.revokeObjectURL(objectUrlToRevoke);
      }
    };
  }, [spzUrl, proxiedSpzUrl, selectedQuality, effectiveWorldId]);

  const handleViewerLog = useCallback((msg: string) => {
    setViewerDebugLogs((prev) => [...prev.slice(-14), `[viewer] ${msg}`]);
  }, []);

  const goToMyProjects = useCallback(() => {
    router.replace("/(tabs)/gallery");

    // Expo Router can occasionally miss nested-tab replace transitions.
    // Keep a short fallback push to guarantee navigation.
    setTimeout(() => {
      router.push("/(tabs)/gallery");
    }, 120);
  }, [router]);

  const openSaveProjectModal = () => {
    const defaultName = `Project ${new Date().toLocaleDateString()}`;
    setProjectName(defaultName);
    setSaveStatusText(null);
    setIsSaveModalOpen(true);
  };

  const saveProject = async () => {
    const trimmedName = projectName.trim();
    if (!trimmedName) {
      Alert.alert("Missing name", "Please enter a project name.");
      return;
    }

    if (!effectiveWorldId && !operationId) {
      Alert.alert("Unavailable", "Project data is not ready yet.");
      return;
    }

    setIsSavingProject(true);
    setSaveStatusText("Saving project...");
    setViewerDebugLogs((prev) => [...prev, "Save Project tapped."]);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const res = await apiFetch("/api/projects", {
        method: "POST",
        signal: controller.signal,
        body: JSON.stringify({
          name: trimmedName,
          operationId: operationId ? String(operationId) : undefined,
          worldId: effectiveWorldId ?? undefined,
          caption: world?.assets?.caption,
          spzUrls: world?.assets?.splats?.spz_urls,
        }),
      });
      clearTimeout(timeout);

      if (!res.ok) {
        let details = "Unable to save project";
        try {
          const err = await res.json();
          details = formatApiErrorPayload(err, details);
        } catch {
          // ignore parse error
        }
        throw new Error(details);
      }

      setIsSaveModalOpen(false);
      setSaveStatusText(null);
      setViewerDebugLogs((prev) => [...prev, `Project saved: ${trimmedName}`]);
      goToMyProjects();
    } catch (e: any) {
      clearTimeout(timeout);
      const message =
        e?.name === "AbortError"
          ? "Save timed out. Please make sure backend is running and try again."
          : e?.message || "Unable to save project";
      setSaveStatusText(message);
      setViewerDebugLogs((prev) => [...prev, `Save project error: ${message}`]);
      Alert.alert("Save failed", message);
    } finally {
      setIsSavingProject(false);
    }
  };

  const pollOperation = async () => {
    if (!operationId) return;

    try {
      const res = await apiFetch(`/api/operations/${operationId}`);
      if (!res.ok) {
        throw new Error("Failed to poll operation status");
      }

      const operation = (await res.json()) as Operation;
      const progressText = operation.metadata?.progress?.description;
      if (progressText) setStatusText(progressText);

      if (operation.error?.message) {
        setErrorMsg(operation.error.message);
        setStage("error");
        return;
      }

      if (!operation.done) {
        return;
      }

      let resolvedWorld: World | undefined;

      if (operation.response) {
        const response = operation.response as World & { world?: World };
        resolvedWorld = response.world ?? response;
      }

      const metadataWorldId = operation.metadata?.world_id;
      if (!resolvedWorld && metadataWorldId) {
        const worldRes = await apiFetch(`/api/worlds/${metadataWorldId}`);
        if (worldRes.ok) {
          resolvedWorld = (await worldRes.json()) as World;
        }
      }

      if (!resolvedWorld) {
        setErrorMsg("Generation completed but world data is not available yet.");
        setStage("error");
        return;
      }

      const normalizedWorldId =
        (resolvedWorld as any)?.id ||
        (resolvedWorld as any)?.world_id ||
        metadataWorldId ||
        null;

      if (normalizedWorldId) {
        setEffectiveWorldId(String(normalizedWorldId));
      }

      const hasSpzInResolvedWorld = !!resolvedWorld?.assets?.splats?.spz_urls;
      if (normalizedWorldId && !hasSpzInResolvedWorld) {
        try {
          setViewerDebugLogs((prev) => [...prev, `Hydrating world assets from /api/worlds/${normalizedWorldId}...`]);
          const hydratedRes = await apiFetch(`/api/worlds/${normalizedWorldId}`);
          if (hydratedRes.ok) {
            const hydratedWorld = (await hydratedRes.json()) as World;
            resolvedWorld = {
              ...hydratedWorld,
              id: hydratedWorld.id ?? String(normalizedWorldId),
              world_id: hydratedWorld.world_id ?? resolvedWorld.world_id,
            };
            setViewerDebugLogs((prev) => [...prev, "World assets hydrated."]);
          } else {
            setViewerDebugLogs((prev) => [...prev, `World hydrate failed (${hydratedRes.status}).`]);
          }
        } catch (hydrateError: any) {
          setViewerDebugLogs((prev) => [...prev, `World hydrate error: ${hydrateError?.message || "unknown"}`]);
        }
      }

      setWorld(resolvedWorld);
      setViewerDebugLogs((prev) => [
        ...prev,
        `World resolved. id=${(resolvedWorld as any)?.id ?? "n/a"} world_id=${(resolvedWorld as any)?.world_id ?? "n/a"}`,
      ]);
      setStatusText("3D world is ready");
      setStage("done");
    } catch (error: any) {
      setErrorMsg(error?.message || "Failed to fetch generation status");
      setStage("error");
    }
  };

  useEffect(() => {
    if (!operationId) {
      setErrorMsg("Missing operation id");
      setStage("error");
      return;
    }

    pollOperation();
    intervalRef.current = setInterval(pollOperation, POLL_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [operationId]);

  useEffect(() => {
    if (stage !== "polling" && intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, [stage]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style={isFullscreen ? "light" : "dark"} />
      {!isFullscreen && (
        <View style={styles.header}>
          <Pressable onPress={() => router.replace("/(tabs)")} style={styles.backBtn}>
            <Feather name="arrow-left" size={18} color={TEXT_MAIN} />
          </Pressable>
          <Text style={styles.headerTitle}>AI 3D Result</Text>
          <View style={styles.backBtn} />
        </View>
      )}

      {stage === "polling" && (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#c46b4a" />
          <Text style={styles.pollTitle}>Generating your 3D splat diffusion...</Text>
          <Text style={styles.pollSubtitle}>{statusText}</Text>
          <Text style={styles.operationText}>Operation: {operationId}</Text>
        </View>
      )}

      {stage === "error" && (
        <View style={styles.centered}>
          <Feather name="alert-circle" size={30} color="#ef4444" />
          <Text style={styles.errorTitle}>Generation failed</Text>
          <Text style={styles.errorSubtitle}>{errorMsg}</Text>
          <Pressable style={styles.secondaryBtn} onPress={() => router.replace("/(tabs)")}>
            <Text style={styles.secondaryBtnText}>Back to Configure</Text>
          </Pressable>
        </View>
      )}

      {stage === "done" && world && (
        <View style={[styles.viewerContainer, isFullscreen && styles.viewerContainerFullscreen]}>
          {resolvedViewerSpzUrl ? (
            <View style={[styles.embeddedViewerWrap, isFullscreen && styles.embeddedViewerWrapFullscreen]}>
              <SplatViewer key={resolvedViewerSpzUrl || "viewer"} spzUrl={resolvedViewerSpzUrl} onLog={handleViewerLog} />

              <View style={styles.viewerOverlayControls}>
                <View style={styles.viewerBadge}>
                  <Text style={styles.viewerBadgeText}>
                    {selectedQuality === "full_res" ? "High Quality (Full)" : `Quality: ${selectedQuality}`}
                  </Text>
                </View>
                <Pressable style={styles.fullscreenBtn} onPress={() => setIsFullscreen((v) => !v)}>
                  <Feather name={isFullscreen ? "minimize-2" : "maximize-2"} size={16} color={TEXT_MAIN} />
                </Pressable>
              </View>
            </View>
          ) : viewerLoadError ? (
            <View style={styles.previewBanner}>
              <Feather name="alert-triangle" size={28} color="#dc2626" />
              <Text style={styles.previewTitle}>Viewer asset failed to load</Text>
              <Text style={styles.previewSubtitle}>{viewerLoadError}</Text>
            </View>
          ) : (
            <View style={styles.previewBanner}>
              <Feather name="box" size={28} color={TEXT_MUTED} />
              <Text style={styles.previewTitle}>Preparing 3D Asset…</Text>
              <Text style={styles.previewSubtitle}>
                {spzUrl
                  ? "Finalizing in-app renderer and asset streaming."
                  : "Preview URL is unavailable for this world, but generation completed successfully."}
              </Text>
            </View>
          )}

          {!isFullscreen && (
          <ScrollView
            style={styles.bottomPanel}
            contentContainerStyle={styles.bottomPanelContent}
            contentInsetAdjustmentBehavior="automatic"
          >
            <Text style={styles.statusLabel}>Status: {world.status ?? "done"}</Text>
            {!!world.assets?.caption && <Text style={styles.caption}>{world.assets.caption}</Text>}

            <View style={styles.qualityRow}>
              {(["100k", "500k", "full_res"] as const).map((quality) => {
                const selected = quality === selectedQuality;
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

            <Text style={styles.spzUrl} numberOfLines={2}>
              SPZ: {spzUrl || "Unavailable for selected quality"}
            </Text>

            <View style={styles.debugPanel}>
              <Text style={styles.debugTitle}>Viewer Diagnostics</Text>
              <Text style={styles.debugLine}>Quality: {selectedQuality}</Text>
              <Text style={styles.debugLine}>Proxy selected quality: {spzProxyQuality ?? "n/a"}</Text>
              <Text style={styles.debugLine}>World ID: {effectiveWorldId ?? "n/a"}</Text>
              <Text style={styles.debugLine}>Proxy URL: {proxiedSpzUrl ? "ready" : "not-ready"}</Text>
              <Text style={styles.debugLine}>SPZ fetched bytes: {spzFetchBytes ?? "n/a"}</Text>
              <Text style={styles.debugLine}>Resolved source: {resolvedViewerSpzUrl ? "ready" : "not-ready"}</Text>
              {viewerLoadError ? <Text style={styles.debugError}>Error: {viewerLoadError}</Text> : null}
              {viewerDebugLogs.slice(-6).map((line, idx) => (
                <Text key={`${line}-${idx}`} style={styles.debugLogLine}>{line}</Text>
              ))}
            </View>

            <View style={styles.actionsRow}>
              <Pressable style={styles.primaryActionBtn} onPress={openSaveProjectModal}>
                <Text style={styles.primaryActionBtnText}>Save Project</Text>
              </Pressable>
              {resolvedViewerSpzUrl ? (
                <Pressable style={styles.secondaryBtn} onPress={() => setIsFullscreen(true)}>
                  <Text style={styles.secondaryBtnText}>Fullscreen Preview</Text>
                </Pressable>
              ) : null}
              {!!world.id && (
                <Pressable
                  style={styles.secondaryBtn}
                  onPress={() => router.push({ pathname: "/model-view/[worldId]", params: { worldId: world.id } })}
                >
                  <Text style={styles.secondaryBtnText}>Open In-App Detail</Text>
                </Pressable>
              )}
            </View>
          </ScrollView>
          )}
        </View>
      )}

      <Modal visible={isSaveModalOpen} transparent animationType="fade" onRequestClose={() => setIsSaveModalOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Save Project</Text>
            <Text style={styles.modalSubtitle}>Give this design a name so you can open it anytime.</Text>

            <TextInput
              value={projectName}
              onChangeText={setProjectName}
              placeholder="Project name"
              placeholderTextColor="#64748b"
              style={styles.modalInput}
              autoFocus
            />

            {saveStatusText ? <Text style={styles.modalStatusText}>{saveStatusText}</Text> : null}

            <View style={styles.modalActions}>
              <Pressable style={styles.modalCancelBtn} onPress={() => setIsSaveModalOpen(false)} disabled={isSavingProject}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.modalSaveBtn} onPress={saveProject} disabled={isSavingProject}>
                <Text style={styles.modalSaveText}>{isSavingProject ? "Saving..." : "Save"}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: CREAM,
  },
  header: {
    height: 56,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: BORDER_SUBTLE,
    backgroundColor: CREAM,
  },
  backBtn: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    color: TEXT_MAIN,
    fontSize: 16,
    fontWeight: "700",
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    gap: 10,
    backgroundColor: CREAM,
  },
  pollTitle: {
    color: TEXT_MAIN,
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
  },
  pollSubtitle: {
    color: TEXT_SECONDARY,
    fontSize: 14,
    textAlign: "center",
  },
  operationText: {
    marginTop: 8,
    color: TEXT_MUTED,
    fontSize: 12,
  },
  errorTitle: {
    color: "#b91c1c",
    fontSize: 18,
    fontWeight: "700",
  },
  errorSubtitle: {
    color: TEXT_SECONDARY,
    textAlign: "center",
    fontSize: 14,
  },
  viewerContainer: {
    flex: 1,
    backgroundColor: CREAM,
  },
  viewerContainerFullscreen: {
    backgroundColor: "#0c0a09",
  },
  embeddedViewerWrap: {
    flex: 1,
    margin: 12,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: BORDER_SUBTLE,
    backgroundColor: CREAM,
    minHeight: 320,
  },
  embeddedViewerWrapFullscreen: {
    margin: 0,
    borderRadius: 0,
    borderWidth: 0,
    minHeight: 0,
    backgroundColor: "#0c0a09",
  },
  embeddedViewer: {
    flex: 1,
    backgroundColor: CREAM,
  },
  webIframe: {
    width: "100%",
    height: "100%",
    borderWidth: 0,
    backgroundColor: CREAM,
  },
  viewerOverlayControls: {
    position: "absolute",
    top: 12,
    left: 12,
    right: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  viewerBadge: {
    backgroundColor: "rgba(255,255,255,0.92)",
    borderColor: BORDER_SUBTLE,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  viewerBadgeText: {
    color: TEXT_MAIN,
    fontSize: 11,
    fontWeight: "600",
  },
  fullscreenBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.92)",
    borderColor: BORDER_SUBTLE,
    borderWidth: 1,
  },
  webviewLoading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: CREAM,
  },
  webviewLoadingText: {
    color: TEXT_SECONDARY,
    fontSize: 13,
  },
  previewBanner: {
    margin: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER_SUBTLE,
    backgroundColor: SURFACE_CARD,
    paddingHorizontal: 16,
    paddingVertical: 22,
    alignItems: "center",
    gap: 8,
  },
  previewTitle: {
    color: TEXT_MAIN,
    fontSize: 18,
    fontWeight: "700",
  },
  previewSubtitle: {
    color: TEXT_SECONDARY,
    fontSize: 13,
    textAlign: "center",
  },
  bottomPanel: {
    maxHeight: 320,
    borderTopWidth: 1,
    borderTopColor: BORDER_SUBTLE,
    backgroundColor: SURFACE_CARD,
  },
  bottomPanelContent: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 10,
  },
  statusLabel: {
    color: TEXT_MAIN,
    fontSize: 14,
    fontWeight: "600",
  },
  caption: {
    color: TEXT_SECONDARY,
    fontSize: 13,
  },
  qualityRow: {
    flexDirection: "row",
    gap: 8,
  },
  qualityChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: CREAM,
    borderWidth: 1,
    borderColor: BORDER_SUBTLE,
  },
  qualityChipSelected: {
    backgroundColor: "#c46b4a",
    borderColor: "#c46b4a",
  },
  qualityText: {
    color: TEXT_SECONDARY,
    fontSize: 12,
    fontWeight: "600",
  },
  qualityTextSelected: {
    color: "#fff",
  },
  spzUrl: {
    color: TEXT_MUTED,
    fontSize: 12,
  },
  debugPanel: {
    marginTop: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BORDER_SUBTLE,
    backgroundColor: CREAM,
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 4,
  },
  debugTitle: {
    color: TEXT_MAIN,
    fontSize: 12,
    fontWeight: "700",
  },
  debugLine: {
    color: TEXT_SECONDARY,
    fontSize: 11,
  },
  debugError: {
    color: "#b91c1c",
    fontSize: 11,
  },
  debugLogLine: {
    color: TEXT_MUTED,
    fontSize: 10,
  },
  secondaryBtn: {
    alignSelf: "flex-start",
    marginTop: 6,
    backgroundColor: "#eae3d6",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  secondaryBtnText: {
    color: TEXT_MAIN,
    fontSize: 13,
    fontWeight: "600",
  },
  actionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  primaryActionBtn: {
    alignSelf: "flex-start",
    marginTop: 6,
    backgroundColor: "#c46b4a",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  primaryActionBtnText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(58, 47, 42, 0.35)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  modalCard: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: SURFACE_CARD,
    borderWidth: 1,
    borderColor: BORDER_SUBTLE,
    borderRadius: 14,
    padding: 16,
    gap: 10,
  },
  modalTitle: {
    color: TEXT_MAIN,
    fontSize: 18,
    fontWeight: "700",
  },
  modalSubtitle: {
    color: TEXT_SECONDARY,
    fontSize: 13,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: BORDER_SUBTLE,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: TEXT_MAIN,
    backgroundColor: CREAM,
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
    marginTop: 4,
  },
  modalCancelBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#eae3d6",
  },
  modalCancelText: {
    color: TEXT_MAIN,
    fontWeight: "600",
  },
  modalSaveBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#c46b4a",
  },
  modalSaveText: {
    color: "#fff",
    fontWeight: "700",
  },
  modalStatusText: {
    color: TEXT_SECONDARY,
    fontSize: 12,
  },
});
