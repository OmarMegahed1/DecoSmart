import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { WebView } from "react-native-webview";
import { useRef } from "react";
import { buildSplatViewerHtml } from "./splatViewerHtml";

type Props = {
  spzUrl: string;
  onLog?: (msg: string) => void;
};

export default function SplatViewer({ spzUrl, onLog }: Props) {
  const webViewRef = useRef<WebView | null>(null);

  const moveCamera = (strafe: number, forward: number) => {
    const js = `window.__splatMove && window.__splatMove(${strafe}, ${forward}); true;`;
    webViewRef.current?.injectJavaScript(js);
  };

  return (
    <View style={styles.container}>
      <WebView
        ref={webViewRef}
        originWhitelist={["*"]}
        source={{ html: buildSplatViewerHtml(spzUrl) }}
        style={styles.webview}
        onMessage={(event) => {
          try {
            const parsed = JSON.parse(event.nativeEvent.data);
            if (!parsed?.__splatViewer) return;
            const msg = parsed?.payload?.message
              ? `${parsed.type}: ${parsed.payload.message}`
              : parsed.type;
            onLog?.(msg);
          } catch {
            // ignore malformed message
          }
        }}
        startInLoadingState
        renderLoading={() => (
          <View style={styles.loading}>
            <ActivityIndicator color="#c46b4a" size="large" />
          </View>
        )}
      />

      <View style={styles.pad} pointerEvents="box-none">
        <View style={styles.padGrid}>
          <View />
          <Pressable style={styles.padBtn} onPress={() => moveCamera(0, 0.22)}><Text style={styles.padTxt}>▲</Text></Pressable>
          <View />
          <Pressable style={styles.padBtn} onPress={() => moveCamera(-0.22, 0)}><Text style={styles.padTxt}>◀</Text></Pressable>
          <View style={styles.padCenter} />
          <Pressable style={styles.padBtn} onPress={() => moveCamera(0.22, 0)}><Text style={styles.padTxt}>▶</Text></Pressable>
          <View />
          <Pressable style={styles.padBtn} onPress={() => moveCamera(0, -0.22)}><Text style={styles.padTxt}>▼</Text></Pressable>
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
