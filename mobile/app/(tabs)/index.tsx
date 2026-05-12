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
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "expo-router";
import { apiFetch, readApiErrorMessage } from "../../lib/api";
import { Feather } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";

type RoomType = "living_room" | "bedroom" | "kitchen" | "bathroom" | "office" | "dining";
type StyleType = "modern" | "industrial" | "minimalist";
type PaletteType = "earth_tones" | "ocean_breeze" | "midnight_slate";
type InputMode = "photo" | "cad_dxf";

type Option<T extends string> = {
  id: T;
  label: string;
  description?: string;
  icon: keyof typeof Feather.glyphMap;
};

const STEP_COUNT = 5;

/** Stable id for deduping when merging multi-select sessions (tap again to add more). */
function pickerAssetKey(asset: DocumentPicker.DocumentPickerAsset): string {
  if (asset.uri) return asset.uri;
  return `${asset.name ?? "file"}:${asset.size ?? 0}`;
}

function StepGate({ unlocked, children }: { unlocked: boolean; children: ReactNode }) {
  return (
    <View style={styles.stepGate}>
      <View style={[styles.stepGateInner, !unlocked && styles.stepGateMuted]}>{children}</View>
      {!unlocked ? (
        <Pressable
          style={styles.stepLockOverlay}
          accessibilityRole="button"
          accessibilityHint="Completes after the previous step"
          accessibilityLabel="Locked: finish the previous step first"
          onPress={() =>
            Alert.alert("Previous step required", "Complete each step in order to unlock the next one.")
          }
        />
      ) : null}
    </View>
  );
}

export default function HomeScreen() {
  const { push } = useRouter();
  const [selectedAssets, setSelectedAssets] = useState<DocumentPicker.DocumentPickerAsset[]>([]);
  const [selectedDxf, setSelectedDxf] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [areaMq, setAreaMq] = useState("");
  const [roomType, setRoomType] = useState<RoomType>("living_room");
  const [styleType, setStyleType] = useState<StyleType>("modern");
  const [palette, setPalette] = useState<PaletteType>("earth_tones");
  const [inputMode, setInputMode] = useState<InputMode>("photo");
  const [instructions, setInstructions] = useState("");
  const [loading, setLoading] = useState(false);
  const [progressText, setProgressText] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [lastOperationId, setLastOperationId] = useState<string | null>(null);

  /** Step 2+ requires explicit choice (defaults don’t count until user taps). */
  const [roomTypeChosen, setRoomTypeChosen] = useState(false);
  const [styleChosen, setStyleChosen] = useState(false);
  const [paletteChosen, setPaletteChosen] = useState(false);

  const areaValid = useMemo(() => {
    const a = parseFloat(areaMq);
    return areaMq.trim() !== "" && !Number.isNaN(a) && a > 0;
  }, [areaMq]);

  const step1Complete =
    inputMode === "photo" ? selectedAssets.length > 0 : selectedDxf != null && areaValid;

  useEffect(() => {
    if (!step1Complete) {
      setRoomTypeChosen(false);
      setStyleChosen(false);
      setPaletteChosen(false);
    }
  }, [step1Complete]);

  useEffect(() => {
    if (!roomTypeChosen) {
      setStyleChosen(false);
      setPaletteChosen(false);
    }
  }, [roomTypeChosen]);

  useEffect(() => {
    if (!styleChosen) {
      setPaletteChosen(false);
    }
  }, [styleChosen]);

  const unlockStep2 = step1Complete;
  const unlockStep3 = step1Complete && roomTypeChosen;
  const unlockStep4 = step1Complete && roomTypeChosen && styleChosen;
  const unlockStep5 = step1Complete && roomTypeChosen && styleChosen && paletteChosen;

  const instructionsDone = instructions.trim().length > 0;

  const milestoneDone = [step1Complete, roomTypeChosen, styleChosen, paletteChosen, instructionsDone] as const;

  const completedCount = milestoneDone.filter(Boolean).length;
  const allStepsDone = completedCount === STEP_COUNT;
  const currentStep = allStepsDone ? STEP_COUNT : completedCount + 1;

  const canSubmit =
    step1Complete && roomTypeChosen && styleChosen && paletteChosen;

  const goToResult = (operationId: string) => {
    push({
      pathname: "/result/[operationId]",
      params: { operationId },
    });
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

      if (result.canceled || !result.assets?.length) return;

      setSelectedAssets((prev) => {
        const max = 4;
        if (prev.length >= max) {
          setTimeout(
            () =>
              Alert.alert(
                "Maximum 4 photos",
                "Remove photos first if you want to choose different images.",
              ),
            0,
          );
          return prev;
        }

        const prevKeys = new Set(prev.map(pickerAssetKey));
        const slotsLeft = max - prev.length;
        const uniqueIncoming = result.assets.filter((a) => !prevKeys.has(pickerAssetKey(a)));

        if (uniqueIncoming.length > slotsLeft) {
          setTimeout(
            () =>
              Alert.alert(
                "Photo limit",
                `You can add ${slotsLeft} more (max ${max} total). Extra images were not added.`,
              ),
            0,
          );
        }

        const seen = new Set(prev.map(pickerAssetKey));
        const next = [...prev];

        for (const asset of result.assets) {
          if (next.length >= max) break;
          const key = pickerAssetKey(asset);
          if (seen.has(key)) continue;
          seen.add(key);
          next.push(asset);
        }

        return next;
      });
    } catch (e) {
      console.error(e);
      Alert.alert("Upload Error", "Failed to select photos.");
    }
  };

  const pickDxf = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["*/*"],
        multiple: false,
        copyToCacheDirectory: true,
      });
      if (!result.canceled && result.assets?.length) {
        const asset = result.assets[0];
        const name = (asset.name ?? "").toLowerCase();
        if (!name.endsWith(".dxf")) {
          Alert.alert("Wrong File Type", "Please select a .dxf AutoCAD file.");
          return;
        }
        setSelectedDxf(asset);
      }
    } catch (e) {
      console.error(e);
      Alert.alert("Upload Error", "Failed to select DXF file.");
    }
  };

  const clearPhotoUpload = useCallback(() => {
    setSelectedAssets([]);
  }, []);

  const clearDxfUpload = useCallback(() => {
    setSelectedDxf(null);
    setAreaMq("");
  }, []);

  const handleCadProcess = async () => {
    if (!canSubmit) {
      Alert.alert(
        "Complete all steps",
        "Upload your DXF and total area, then choose room type, style, and color palette.",
      );
      return;
    }
    if (!selectedDxf) {
      Alert.alert("DXF Required", "Please select an AutoCAD .dxf file.");
      return;
    }
    const area = parseFloat(areaMq);
    if (!areaMq || isNaN(area) || area <= 0) {
      Alert.alert("Area Required", "Please enter the total apartment area in m².");
      return;
    }

    setSubmitError(null);
    setLoading(true);
    setProgressText("Uploading DXF to AI pipeline...");

    try {
      const formData = new FormData();
      if (Platform.OS === "web" && (selectedDxf as any).file) {
        formData.append("dxf_file", (selectedDxf as any).file);
      } else {
        formData.append("dxf_file", {
          uri: selectedDxf.uri,
          name: selectedDxf.name ?? "floor-plan.dxf",
          type: "application/octet-stream",
        } as any);
      }
      formData.append("area_m2", String(area));
      formData.append("style", styleType);
      formData.append("palette", palette.replace(/_/g, " "));
      formData.append("room_type", roomType);

      setProgressText("Processing floor plan (this may take 1–3 minutes)...");

      const cadRes = await apiFetch("/api/cad/process", {
        method: "POST",
        body: formData,
      });

      if (!cadRes.ok) {
        throw new Error(await readApiErrorMessage(cadRes, "CAD processing failed"));
      }

      const cadData = await cadRes.json();
      const jobId: string = cadData.job_id;
      const rooms = cadData.rooms ?? [];

      if (!rooms.length) {
        throw new Error("No rooms were detected in the DXF file. Try a different floor plan.");
      }

      setLoading(false);
      setProgressText("");

      push({
        pathname: "/room-picker/[jobId]",
        params: {
          jobId,
          style: styleType,
          palette,
          instructions: instructions.trim(),
        },
      });
    } catch (error: any) {
      const message = error?.message || "Unable to process DXF.";
      setSubmitError(message);
      Alert.alert("Error", message);
    } finally {
      setLoading(false);
      setProgressText("");
    }
  };

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

    formData.append("source_type", "photo");
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
    if (!canSubmit) {
      Alert.alert(
        "Complete all steps",
        "Upload your file(s), then select room type, style, and color palette to continue.",
      );
      return;
    }
    if (inputMode === "cad_dxf") {
      return handleCadProcess();
    }
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
          throw new Error(await readApiErrorMessage(uploadRes, "Photo upload failed"));
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
          input_mode: "photo",
        }),
      });

      if (!generateRes.ok) {
        throw new Error(await readApiErrorMessage(generateRes, "Failed to start generation"));
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
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View
          style={styles.progressRow}
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 1, max: STEP_COUNT, now: currentStep }}
          accessibilityLabel="Form steps"
        >
          {Array.from({ length: STEP_COUNT }, (_, i) => i + 1).map((step) => {
            const done = allStepsDone || step < currentStep;
            const isCurrent = !allStepsDone && step === currentStep;
            const isUpcoming = !allStepsDone && step > currentStep;

            return (
              <View
                key={step}
                accessible
                accessibilityLabel={`Step ${step} of ${STEP_COUNT}${
                  done ? ", completed" : isCurrent ? ", current" : ", locked"
                }`}
                style={[
                  styles.progressBar,
                  done && styles.progressBarComplete,
                  isCurrent && styles.progressBarCurrent,
                  isUpcoming && styles.progressBarInactive,
                ]}
              />
            );
          })}
        </View>

        <View style={styles.section}>
          <Text style={styles.stepLabel}>STEP 1</Text>
          <Text style={styles.sectionTitle}>
            {inputMode === "cad_dxf" ? "Upload AutoCAD File" : "Upload Room Photo"}
          </Text>
          <Text style={styles.sectionSubtitle}>
            {inputMode === "cad_dxf"
              ? "Upload a .dxf floor plan. The AI will split it into rooms and generate realistic interior previews."
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
              style={[styles.modeChip, inputMode === "cad_dxf" && styles.modeChipActive]}
              onPress={() => setInputMode("cad_dxf")}
            >
              <Text style={[styles.modeChipText, inputMode === "cad_dxf" && styles.modeChipTextActive]}>
                AutoCAD (DXF)
              </Text>
            </Pressable>
          </View>

          {inputMode === "cad_dxf" ? (
            <>
              <Pressable style={styles.uploadCard} onPress={pickDxf}>
                <View style={styles.uploadIconBubble}>
                  <Feather name="file-text" size={24} color="#6b705c" />
                </View>
                <Text style={styles.uploadTitle}>
                  {selectedDxf ? selectedDxf.name : "Tap to select AutoCAD .dxf file"}
                </Text>
                <Text style={styles.uploadHint}>
                  {selectedDxf
                    ? "File selected — tap to change"
                    : "Select the .dxf floor plan exported from AutoCAD"}
                </Text>
                {selectedDxf ? (
                  <View style={styles.countPill}>
                    <Text style={styles.countText}>1 DXF file ready</Text>
                  </View>
                ) : null}
              </Pressable>

              <View style={styles.areaInputRow}>
                <Feather name="maximize-2" size={16} color="#6b705c" style={styles.areaInputIcon} />
                <TextInput
                  style={styles.areaInput}
                  placeholder="Total apartment area (m²), e.g. 120"
                  placeholderTextColor="#94a3b8"
                  keyboardType="numeric"
                  value={areaMq}
                  onChangeText={setAreaMq}
                />
              </View>

              {selectedDxf != null || areaMq.trim() !== "" ? (
                <Pressable
                  style={styles.clearUploadBtn}
                  onPress={clearDxfUpload}
                  accessibilityRole="button"
                  accessibilityLabel="Remove DXF file and clear area"
                >
                  <Feather name="x-circle" size={18} color="#9a3412" />
                  <Text style={styles.clearUploadText}>Cancel DXF & area</Text>
                </Pressable>
              ) : null}
            </>
          ) : (
            <>
            <Pressable style={styles.uploadCard} onPress={pickAssets}>
              <View style={styles.uploadIconBubble}>
                <Feather name="camera" size={24} color="#6b705c" />
              </View>
              <Text style={styles.uploadTitle}>Tap to upload or take a photo</Text>
              <Text style={styles.uploadHint}>
                Select up to 4 images per picker — tap again to add more (merged up to 4 total).
              </Text>
              <View style={styles.countPill}>
                <Text style={styles.countText}>{selectedAssets.length}/4 photos uploaded</Text>
              </View>
            </Pressable>
            {selectedAssets.length > 0 ? (
              <Pressable
                style={styles.clearUploadBtn}
                onPress={clearPhotoUpload}
                accessibilityRole="button"
                accessibilityLabel="Remove all selected photos"
              >
                <Feather name="x-circle" size={18} color="#9a3412" />
                <Text style={styles.clearUploadText}>
                  Remove {selectedAssets.length} photo{selectedAssets.length !== 1 ? "s" : ""}
                </Text>
              </Pressable>
            ) : null}
            </>
          )}
        </View>

        <StepGate unlocked={unlockStep2}>
          <View style={styles.section}>
          <Text style={styles.stepLabel}>STEP 2</Text>
          <Text style={styles.sectionTitle}>Select Room Type</Text>
          <Text style={styles.sectionSubtitle}>Which space are we transforming today?</Text>
          <View style={styles.roomGrid}>
            {roomOptions.map((option) => {
              const selected = roomTypeChosen && option.id === roomType;
              return (
                <Pressable
                  key={option.id}
                  style={[styles.roomBtn, selected && styles.roomBtnSelected]}
                  onPress={() => {
                    setRoomType(option.id);
                    setRoomTypeChosen(true);
                  }}
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
        </StepGate>

        <StepGate unlocked={unlockStep3}>
          <View style={styles.section}>
          <Text style={styles.stepLabel}>STEP 3</Text>
          <Text style={styles.sectionTitle}>Choose your Style</Text>
          {styleOptions.map((option) => {
            const selected = styleChosen && option.id === styleType;
            return (
              <Pressable
                key={option.id}
                style={[styles.selectCard, selected && styles.selectCardSelected]}
                onPress={() => {
                  setStyleType(option.id);
                  setStyleChosen(true);
                }}
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
        </StepGate>

        <StepGate unlocked={unlockStep4}>
          <View style={styles.section}>
          <Text style={styles.stepLabel}>STEP 4</Text>
          <Text style={styles.sectionTitle}>Pick a Color Palette</Text>
          {paletteOptions.map((option) => {
            const selected = paletteChosen && option.id === palette;
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
                onPress={() => {
                  setPalette(option.id);
                  setPaletteChosen(true);
                }}
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
        </StepGate>

        <StepGate unlocked={unlockStep5}>
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
        </StepGate>
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          style={[styles.generateBtn, !canSubmit && styles.generateBtnDisabled]}
          disabled={!canSubmit}
          onPress={handleGenerate}
        >
          <Text style={styles.generateBtnText}>
            {inputMode === "cad_dxf" ? "Analyze Floor Plan" : "Generate AI Design"}
          </Text>
          <Feather name={inputMode === "cad_dxf" ? "cpu" : "zap"} size={14} color="#fff" />
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
  stepGate: {
    position: "relative",
    marginBottom: 0,
  },
  stepGateInner: {
    marginBottom: 0,
  },
  stepGateMuted: {
    opacity: 0.5,
  },
  stepLockOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(245,242,237,0.55)",
    borderRadius: 12,
    zIndex: 2,
  },
  progressRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  progressBar: {
    width: 32,
    height: 6,
    borderRadius: 999,
    flexGrow: 0,
  },
  progressBarComplete: {
    backgroundColor: "#6b705c",
  },
  progressBarCurrent: {
    backgroundColor: "#c46b4a",
    height: 8,
    shadowColor: "#c46b4a",
    shadowOpacity: 0.35,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 0 },
    elevation: 2,
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
  clearUploadBtn: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(154,52,18,0.35)",
    backgroundColor: "rgba(254,243,199,0.45)",
  },
  clearUploadText: {
    color: "#9a3412",
    fontSize: 14,
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
  areaInputRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#fff",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  areaInputIcon: {
    marginRight: 8,
  },
  areaInput: {
    flex: 1,
    color: "#334155",
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
  generateBtnDisabled: {
    opacity: 0.45,
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
