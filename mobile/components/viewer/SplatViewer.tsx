import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { WebView } from "react-native-webview";
import React, { useCallback, useEffect, useRef } from "react";
import { Feather } from "@expo/vector-icons";
import { Paths } from "expo-file-system";
import { buildSplatViewerHtml } from "./splatViewerHtml";
import { webViewCacheReadAccessUrl } from "../../lib/spzViewerAsset";

type Props = {
  spzUrl: string;
  /** Only fatal viewer / WebGL errors from the splat bootstrap. */
  onError?: (message: string) => void;
  /** When true, control shows exit fullscreen (parent must expand layout + browser fullscreen on web). */
  immersive?: boolean;
  onToggleImmersive?: () => void;
};

function parseViewerPayload(raw: string): { type?: string; payload?: { message?: string } } | null {
  try {
    const parsed = JSON.parse(raw);
    if (!parsed?.__splatViewer) return null;
    return parsed;
  } catch {
    return null;
  }
}

export default function SplatViewer({ spzUrl, onError, immersive, onToggleImmersive }: Props) {
  const webViewRef = useRef<WebView | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const handleRuntimeMessage = useCallback(
    (raw: string) => {
      const parsed = parseViewerPayload(raw);
      if (parsed?.type === "render-error") {
        const msg = parsed.payload?.message || "Viewer failed to start";
        onError?.(msg);
      }
    },
    [onError],
  );

  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    const onMsg = (event: MessageEvent) => {
      if (iframeRef.current && event.source !== iframeRef.current.contentWindow) return;
      if (typeof event.data !== "string") return;
      handleRuntimeMessage(event.data);
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [handleRuntimeMessage]);

  const moveCamera = (strafe: number, forward: number) => {
    if (Platform.OS === "web") {
      const w = iframeRef.current?.contentWindow as
        | (Window & { __splatMove?: (s: number, f: number) => void })
        | undefined;
      w?.__splatMove?.(strafe, forward);
      return;
    }
    const js = `window.__splatMove && window.__splatMove(${strafe}, ${forward}); true;`;
    webViewRef.current?.injectJavaScript(js);
  };

  const showFs = !!onToggleImmersive;

  return (
    <View style={styles.container} collapsable={false}>
      {Platform.OS === "web" ? (
        React.createElement("iframe", {
          ref: iframeRef,
          title: "3D splat preview",
          srcDoc: buildSplatViewerHtml(spzUrl, { maxDpr: 2.25 }),
          sandbox: "allow-scripts allow-same-origin",
          allowFullScreen: true,
          style: {
            width: "100%",
            height: "100%",
            border: "none",
            display: "block",
            flex: 1,
            minHeight: 0,
          },
        })
      ) : (
        <WebView
          ref={webViewRef}
          originWhitelist={["*"]}
          source={{
            html: buildSplatViewerHtml(spzUrl, { maxDpr: 1.65 }),
            baseUrl: Paths.cache.uri,
          }}
          style={styles.webview}
          onMessage={(event) => handleRuntimeMessage(event.nativeEvent.data)}
          allowsFullscreenVideo
          allowFileAccess
          allowFileAccessFromFileURLs
          allowingReadAccessToURL={webViewCacheReadAccessUrl()}
          startInLoadingState
          renderLoading={() => (
            <View style={styles.loading}>
              <ActivityIndicator color="#c46b4a" size="large" />
            </View>
          )}
        />
      )}

      {showFs ? (
        <Pressable
          style={[styles.fsBtn, immersive && styles.fsBtnImmersive]}
          onPress={onToggleImmersive}
          accessibilityRole="button"
          accessibilityLabel={immersive ? "Exit fullscreen" : "Enter fullscreen"}
        >
          <Feather
            name={immersive ? "minimize-2" : "maximize-2"}
            size={18}
            color={immersive ? "#f5efe6" : TEXT_MAIN}
          />
        </Pressable>
      ) : null}

      <View style={styles.pad} pointerEvents="box-none">
        <View style={styles.padGrid}>
          <View />
          <Pressable style={styles.padBtn} onPress={() => moveCamera(0, 0.14)}>
            <Text style={styles.padTxt}>▲</Text>
          </Pressable>
          <View />
          <Pressable style={styles.padBtn} onPress={() => moveCamera(-0.14, 0)}>
            <Text style={styles.padTxt}>◀</Text>
          </Pressable>
          <View style={styles.padCenter} />
          <Pressable style={styles.padBtn} onPress={() => moveCamera(0.14, 0)}>
            <Text style={styles.padTxt}>▶</Text>
          </Pressable>
          <View />
          <Pressable style={styles.padBtn} onPress={() => moveCamera(0, -0.14)}>
            <Text style={styles.padTxt}>▼</Text>
          </Pressable>
          <View />
        </View>
      </View>
    </View>
  );
}

const CREAM = "#F5EFE6";
const TEXT_MAIN = "#3A2F2A";
const BORDER_SOFT = "rgba(107,112,92,0.22)";
const PAD_BG = "rgba(255,255,255,0.88)";

const styles = StyleSheet.create({
  container: { flex: 1 },
  webview: { flex: 1, backgroundColor: CREAM },
  loading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: CREAM,
  },
  fsBtn: {
    position: "absolute",
    top: 12,
    right: 12,
    width: 40,
    height: 40,
    borderRadius: 20,
    zIndex: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: PAD_BG,
    borderWidth: 1,
    borderColor: BORDER_SOFT,
  },
  fsBtnImmersive: {
    backgroundColor: "rgba(0,0,0,0.45)",
    borderColor: "rgba(255,255,255,0.2)",
  },
  pad: {
    position: "absolute",
    right: 12,
    bottom: 12,
  },
  padGrid: {
    width: 132,
    height: 132,
    gap: 6,
    flexDirection: "row",
    flexWrap: "wrap",
  },
  padBtn: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: PAD_BG,
    borderWidth: 1,
    borderColor: BORDER_SOFT,
    alignItems: "center",
    justifyContent: "center",
  },
  padCenter: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(245, 239, 230, 0.95)",
  },
  padTxt: {
    color: TEXT_MAIN,
    fontSize: 14,
    fontWeight: "700",
  },
});
