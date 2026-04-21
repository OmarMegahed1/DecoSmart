import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  ScrollView,
  TextInput,
  Alert,
  Platform,
} from "react-native";
import { useMemo, useState } from "react";
import { useRouter } from "expo-router";
import { apiFetch } from "../../lib/api";
import { Feather } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";

type RoomType = "living_room" | "bedroom" | "kitchen" | "bathroom" | "office" | "dining";
type StyleType = "modern" | "industrial" | "minimalist";
type PaletteType = "earth_tones" | "ocean_breeze" | "midnight_slate";
type InputMode = "photo" | "cad_png";

type Option<T extends string> = {
  id: T;
  label: string;
  description?: string;
  icon: keyof typeof Feather.glyphMap;
};

export default function HomeScreen() {
  const router = useRouter();
  const [selectedAssets, setSelectedAssets] = useState<DocumentPicker.DocumentPickerAsset[]>([]);
  const [roomType, setRoomType] = useState<RoomType>("living_room");
  const [styleType, setStyleType] = useState<StyleType>("modern");
  const [palette, setPalette] = useState<PaletteType>("earth_tones");
  const [inputMode, setInputMode] = useState<InputMode>("photo");
  const [instructions, setInstructions] = useState("");
  const [loading, setLoading] = useState(false);
  const [progressText, setProgressText] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [lastOperationId, setLastOperationId] = useState<string | null>(null);

  const goToResult = (operationId: string) => {
    router.push({
      pathname: "/result/[operationId]",
      params: { operationId },
    });

    // Fallback path variant for route resolution edge-cases.
    setTimeout(() => {
      router.push(`/result/${operationId}` as any);
    }, 120);
  };

  const roomOptions: Option<RoomType>[] = useMemo(
    () => [
      { id: "living_room", label: "Living Room", icon: "briefcase" },
      { id: "bedroom", label: "Bedroom", icon: "archive" },
      { id: "kitchen", label: "Kitchen", icon: "grid" },
      { id: "bathroom", label: "Bathroom", icon: "sliders" },
      { id: "office", label: "Office", icon: "monitor" },
      { id: "dining", label: "Dining", icon: "coffee" },
    ],
    []
  );

  const styleOptions: Option<StyleType>[] = useMemo(
    () => [
      {
        id: "modern",
        label: "Modern",
        description: "Sleek lines and contemporary aesthetics",
        icon: "check-circle",
      },
      {
        id: "industrial",
        label: "Industrial",
        description: "Raw materials and urban vibes",
        icon: "circle",
      },
      {
        id: "minimalist",
        label: "Minimalist",
        description: "Essential forms and peaceful simplicity",
        icon: "circle",
      },
    ],
    []
  );

  const paletteOptions: Option<PaletteType>[] = useMemo(
    () => [
      { id: "earth_tones", label: "Earth Tones", icon: "check-circle" },
      { id: "ocean_breeze", label: "Ocean Breeze", icon: "circle" },
      { id: "midnight_slate", label: "Midnight Slate", icon: "circle" },
    ],
    []
  );

  const pickAssets = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["image/*"],
        multiple: true,
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets?.length) {
        // Backend currently supports up to 4 media_asset_ids per generation request.
        setSelectedAssets(result.assets.slice(0, 4));
      }
    } catch (e) {
      console.error(e);
      Alert.alert("Upload Error", "Failed to select photos.");
    }
  };

  const activeStep = selectedAssets.length > 0 ? 4 : 3;

  const buildUploadFormData = (asset: DocumentPicker.DocumentPickerAsset) => {
    const formData = new FormData();
    const webFile = (asset as any).file;

    if (Platform.OS === "web" && webFile) {
      formData.append("file", webFile);
    } else {
      formData.append("file", {
        uri: asset.uri,
        name: asset.name ?? `room-${Date.now()}.jpg`,
        type: asset.mimeType || "image/jpeg",
      } as any);
    }

    formData.append("source_type", inputMode);
    formData.append("enhance_cad", inputMode === "cad_png" ? "true" : "false");
    if (inputMode === "cad_png") {
      formData.append(
        "enhance_prompt",
        `Convert CAD floor plan to realistic interior concept while preserving layout. Style: ${styleType}. Palette: ${palette}.`
      );
    }
    return formData;
  };

  const buildPrompt = () => {
    const photoCount = selectedAssets.length;
    const custom = instructions.trim();
    return [
      `Room type: ${roomType.replace("_", " ")}.`,
      `Style: ${styleType}.`,
      `Color palette: ${palette.replace("_", " ")}.`,
      `Input photos: ${photoCount}.`,
      custom ? `Custom instructions: ${custom}` : "",
    ]
      .filter(Boolean)
      .join(" ");
  };

  const handleGenerate = async () => {
    if (!selectedAssets.length) {
      Alert.alert("Photo Required", "Please upload at least one room photo.");
      return;
    }

  setSubmitError(null);
    setLoading(true);
    setProgressText("Uploading photos...");

    try {
      const mediaAssetIds: string[] = [];
      const pushIds = (ids: string[]) => {
        for (const id of ids) {
          if (!id || mediaAssetIds.includes(id)) continue;
          mediaAssetIds.push(id);
          if (mediaAssetIds.length >= 4) break;
        }
      };

      for (const asset of selectedAssets.slice(0, 4)) {
        if (mediaAssetIds.length >= 4) break;
        const uploadRes = await apiFetch("/api/upload", {
          method: "POST",
          body: buildUploadFormData(asset),
        });

        if (!uploadRes.ok) {
          let details = "Photo upload failed";
          try {
            const err = await uploadRes.json();
            details = err?.error || details;
          } catch {
            // ignore json parse fallback
          }
          throw new Error(details);
        }

        const uploadData = await uploadRes.json();
        const idsFromArray = Array.isArray(uploadData?.media_asset_ids)
          ? uploadData.media_asset_ids.filter((id: unknown): id is string => typeof id === "string")
          : [];
        if (idsFromArray.length) {
          pushIds(idsFromArray);
        } else {
          const mediaAssetId = uploadData.media_asset_id || uploadData.mediaAssetId;
          if (typeof mediaAssetId === "string") pushIds([mediaAssetId]);
        }
      }

      if (!mediaAssetIds.length) throw new Error("No media assets were uploaded");

      setProgressText("Starting AI generation...");

      const generateRes = await apiFetch("/api/generate", {
        method: "POST",
        body: JSON.stringify({
          media_asset_ids: mediaAssetIds,
          quality: "full",
          prompt: buildPrompt(),
          input_mode: inputMode,
          cad_options:
            inputMode === "cad_png"
              ? {
                  preserve_layout: true,
                  style_hint: styleType,
                }
              : undefined,
        }),
      });

      if (!generateRes.ok) {
        let details = "Failed to start generation";
        try {
          const err = await generateRes.json();
          details = err?.error || details;
        } catch {
          // ignore json parse fallback
        }
        throw new Error(details);
      }

      const generateData = await generateRes.json();
      const operationId = generateData?.operation_id as string | undefined;

      if (!operationId) {
        throw new Error("Generation started but operation id is missing");
      }

      setLastOperationId(String(operationId));
      setProgressText("Generation submitted. Opening result...");
      setLoading(false);
      goToResult(String(operationId));

      return;
    } catch (error: any) {
      const message = error?.message || "Unable to generate design.";
      setSubmitError(message);
      Alert.alert("Error", message);
    } finally {
      setLoading(false);
      setProgressText("");
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator size="large" color="#c46b4a" />
        <Text style={styles.loadingText}>{progressText || "Working..."}</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.progressRow}>
          {[1, 2, 3, 4, 5].map((step) => (
            <View
              key={step}
              style={[
                styles.progressBar,
                step <= activeStep ? styles.progressBarActive : styles.progressBarInactive,
              ]}
            />
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.stepLabel}>STEP 1</Text>
          <Text style={styles.sectionTitle}>
            {inputMode === "cad_png" ? "Upload CAD PNG" : "Upload Room Photo"}
          </Text>
          <Text style={styles.sectionSubtitle}>
            {inputMode === "cad_png"
              ? "CAD mode: your PNG is enhanced with SD + ControlNet before WorldLabs 3D generation."
              : "Our AI uses your photo to analyze spatial dimensions and lighting for best design results."}
          </Text>

          <View style={styles.modeRow}>
            <Pressable
              style={[styles.modeChip, inputMode === "photo" && styles.modeChipActive]}
              onPress={() => setInputMode("photo")}
            >
              <Text style={[styles.modeChipText, inputMode === "photo" && styles.modeChipTextActive]}>
                Photo Mode
              </Text>
            </Pressable>
            <Pressable
              style={[styles.modeChip, inputMode === "cad_png" && styles.modeChipActive]}
              onPress={() => setInputMode("cad_png")}
            >
              <Text style={[styles.modeChipText, inputMode === "cad_png" && styles.modeChipTextActive]}>
                CAD PNG Mode
              </Text>
            </Pressable>
          </View>

          <Pressable style={styles.uploadCard} onPress={pickAssets}>
            <View style={styles.uploadIconBubble}>
              <Feather name={inputMode === "cad_png" ? "grid" : "camera"} size={24} color="#6b705c" />
            </View>
            <Text style={styles.uploadTitle}>
              {inputMode === "cad_png" ? "Tap to upload AutoCAD PNG" : "Tap to upload or take a photo"}
            </Text>
            <Text style={styles.uploadHint}>
              {inputMode === "cad_png"
                ? "Upload up to 4 CAD PNG files for enhancement + 3D generation"
                : "Upload up to 4 photos (JPG, PNG, Max 10MB each)"}
            </Text>
            <View style={styles.countPill}>
              <Text style={styles.countText}>{selectedAssets.length}/4 photos uploaded</Text>
            </View>
          </Pressable>
        </View>

        <View style={styles.section}>
          <Text style={styles.stepLabel}>STEP 2</Text>
          <Text style={styles.sectionTitle}>Select Room Type</Text>
          <Text style={styles.sectionSubtitle}>Which space are we transforming today?</Text>
          <View style={styles.roomGrid}>
            {roomOptions.map((option) => {
              const selected = option.id === roomType;
              return (
                <Pressable
                  key={option.id}
                  style={[styles.roomBtn, selected && styles.roomBtnSelected]}
                  onPress={() => setRoomType(option.id)}
                >
                  <Feather
                    name={option.icon}
                    size={16}
                    color={selected ? "#6b705c" : "#64748b"}
                    style={styles.roomIcon}
                  />
                  <Text style={[styles.roomText, selected && styles.roomTextSelected]}>{option.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.stepLabel}>STEP 3</Text>
          <Text style={styles.sectionTitle}>Choose your Style</Text>
          {styleOptions.map((option) => {
            const selected = option.id === styleType;
            return (
              <Pressable
                key={option.id}
                style={[styles.selectCard, selected && styles.selectCardSelected]}
                onPress={() => setStyleType(option.id)}
              >
                <View style={styles.selectCopy}>
                  <Text style={[styles.selectTitle, selected && styles.selectTitleSelected]}>
                    {option.label}
                  </Text>
                  <Text style={styles.selectDescription}>{option.description}</Text>
                </View>
                <Feather
                  name={selected ? "check-circle" : "circle"}
                  size={18}
                  color={selected ? "#6b705c" : "#94a3b8"}
                />
              </Pressable>
            );
          })}
        </View>

        <View style={styles.section}>
          <Text style={styles.stepLabel}>STEP 4</Text>
          <Text style={styles.sectionTitle}>Pick a Color Palette</Text>
          {paletteOptions.map((option) => {
            const selected = option.id === palette;
            const colors =
              option.id === "earth_tones"
                ? ["#8c7851", "#d4c3a3", "#f4f1ea", "#4a3f35"]
                : option.id === "ocean_breeze"
                ? ["#005f73", "#0a9396", "#94d2bd", "#e9d8a6"]
                : ["#1a1c2c", "#5d275d", "#b13e53", "#ef7d57"];

            return (
              <Pressable
                key={option.id}
                style={[styles.paletteCard, selected && styles.selectCardSelected]}
                onPress={() => setPalette(option.id)}
              >
                <View style={styles.paletteHeader}>
                  <Text style={styles.paletteTitle}>{option.label}</Text>
                  <Feather
                    name={selected ? "check-circle" : "circle"}
                    size={18}
                    color={selected ? "#6b705c" : "#94a3b8"}
                  />
                </View>
                <View style={styles.swatchRow}>
                  {colors.map((color) => (
                    <View key={color} style={[styles.swatch, { backgroundColor: color }]} />
                  ))}
                </View>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.section}>
          <Text style={styles.stepLabel}>STEP 5</Text>
          <Text style={styles.sectionTitle}>AI Custom Instructions</Text>
          <Text style={styles.sectionSubtitle}>
            Any specific details or features you want the AI to include?
          </Text>
          <TextInput
            style={styles.instructionsInput}
            placeholder="e.g., Make it look like a cozy library with many bookshelves..."
            placeholderTextColor="#94a3b8"
            multiline
            value={instructions}
            onChangeText={setInstructions}
            textAlignVertical="top"
          />
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Pressable style={styles.generateBtn} onPress={handleGenerate}>
          <Text style={styles.generateBtnText}>Generate AI Design</Text>
          <Feather name="zap" size={14} color="#fff" />
        </Pressable>

        {submitError ? <Text style={styles.submitErrorText}>{submitError}</Text> : null}

        {lastOperationId ? (
          <Pressable style={styles.continueBtn} onPress={() => goToResult(lastOperationId)}>
            <Text style={styles.continueBtnText}>Continue to Result</Text>
            <Feather name="arrow-right" size={14} color="#334155" />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#f5f2ed",
  },
  loadingScreen: {
    flex: 1,
    backgroundColor: "#f5f2ed",
    justifyContent: "center",
    alignItems: "center",
    gap: 10,
  },
  loadingText: {
    color: "#6b705c",
    fontWeight: "600",
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 120,
  },
  progressRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 18,
  },
  progressBar: {
    width: 32,
    height: 6,
    borderRadius: 999,
  },
  progressBarActive: {
    backgroundColor: "#6b705c",
  },
  progressBarInactive: {
    backgroundColor: "rgba(107,112,92,0.2)",
  },
  section: {
    marginBottom: 28,
  },
  stepLabel: {
    textAlign: "center",
    color: "#6b705c",
    fontSize: 11,
    letterSpacing: 2,
    fontWeight: "700",
    marginBottom: 4,
  },
  sectionTitle: {
    textAlign: "center",
    color: "#0f172a",
    fontSize: 34,
    fontWeight: "800",
    marginBottom: 8,
  },
  sectionSubtitle: {
    textAlign: "center",
    color: "#475569",
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 14,
  },
  uploadCard: {
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: "rgba(107,112,92,0.4)",
    borderRadius: 10,
    backgroundColor: "rgba(107,112,92,0.05)",
    alignItems: "center",
    paddingVertical: 22,
    paddingHorizontal: 16,
  },
  modeRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  modeChip: {
    flex: 1,
    height: 40,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#d6d3d1",
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  modeChipActive: {
    borderColor: "#6b705c",
    backgroundColor: "rgba(107,112,92,0.12)",
  },
  modeChipText: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: "700",
  },
  modeChipTextActive: {
    color: "#334155",
  },
  uploadIconBubble: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(107,112,92,0.2)",
    marginBottom: 12,
  },
  uploadTitle: {
    color: "#0f172a",
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 8,
    textAlign: "center",
  },
  uploadHint: {
    color: "#64748b",
    fontSize: 12,
    marginBottom: 10,
    textAlign: "center",
  },
  countPill: {
    backgroundColor: "rgba(107,112,92,0.1)",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  countText: {
    color: "#6b705c",
    fontSize: 12,
    fontWeight: "600",
  },
  roomGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 12,
  },
  roomBtn: {
    width: "48%",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#fff",
    borderRadius: 10,
    alignItems: "center",
    paddingVertical: 16,
  },
  roomBtnSelected: {
    borderWidth: 2,
    borderColor: "#6b705c",
    backgroundColor: "rgba(107,112,92,0.1)",
  },
  roomIcon: {
    marginBottom: 8,
  },
  roomText: {
    color: "#1e293b",
    fontSize: 13,
    fontWeight: "700",
  },
  roomTextSelected: {
    color: "#0f172a",
  },
  selectCard: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  selectCardSelected: {
    borderWidth: 2,
    borderColor: "#6b705c",
    backgroundColor: "rgba(107,112,92,0.06)",
  },
  selectCopy: {
    flex: 1,
    marginRight: 10,
  },
  selectTitle: {
    color: "#1e293b",
    fontWeight: "700",
    fontSize: 16,
    marginBottom: 2,
  },
  selectTitleSelected: {
    color: "#0f172a",
  },
  selectDescription: {
    color: "#64748b",
    fontSize: 12,
  },
  paletteCard: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
  },
  paletteHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  paletteTitle: {
    color: "#334155",
    fontWeight: "700",
    fontSize: 14,
  },
  swatchRow: {
    flexDirection: "row",
    overflow: "hidden",
    borderRadius: 8,
    height: 42,
  },
  swatch: {
    flex: 1,
  },
  instructionsInput: {
    height: 126,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#fff",
    color: "#334155",
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
  },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: 1,
    borderTopColor: "rgba(107,112,92,0.15)",
    backgroundColor: "rgba(245,242,237,0.95)",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
  },
  generateBtn: {
    backgroundColor: "#c46b4a",
    height: 56,
    borderRadius: 10,
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  generateBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "800",
  },
  submitErrorText: {
    marginTop: 8,
    color: "#b91c1c",
    fontSize: 12,
    textAlign: "center",
  },
  continueBtn: {
    marginTop: 10,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#fff",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  continueBtnText: {
    color: "#334155",
    fontWeight: "700",
    fontSize: 14,
  },
});
