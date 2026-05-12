import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { FlashList } from "@shopify/flash-list";
import { apiFetch, readApiErrorMessage } from "../../lib/api";
import {
  type CadRoom,
  fetchCadJobRooms,
  mergeRoomPreviewsFromLegacy,
  normalizeCadRoom,
} from "../../lib/cad";

const ROOM_TYPE_LABELS: Record<string, string> = {
  kitchen: "Kitchen",
  living_room: "Living Room",
  reception: "Reception",
  bedroom: "Bedroom",
  bathroom: "Bathroom",
  dressing: "Dressing Room",
  dining_room: "Dining Room",
  office: "Office",
  room: "Room",
};

function parseLegacyRoomsParam(raw: string | undefined): CadRoom[] | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.map((row) => normalizeCadRoom(row as Partial<CadRoom>));
  } catch {
    return null;
  }
}

const priceFormatter = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });

type RoomRowProps = {
  room: CadRoom;
  isLoading: boolean;
  selectionLocked: boolean;
  onPress: (room: CadRoom) => void;
};

const RoomRow = memo(function RoomRow({ room, isLoading, selectionLocked, onPress }: RoomRowProps) {
  const label = ROOM_TYPE_LABELS[room.type] ?? room.type;

  return (
    <Pressable
      style={[styles.card, isLoading ? styles.cardLoading : undefined]}
      onPress={() => onPress(room)}
      disabled={isLoading || selectionLocked}
    >
      {room.preview_data_url ? (
        <Image
          source={{ uri: room.preview_data_url }}
          style={styles.cardImage}
          contentFit="cover"
          recyclingKey={room.db_id}
        />
      ) : (
        <View style={[styles.cardImage, styles.cardImagePlaceholder]}>
          <Feather name="image" size={32} color="rgba(107,112,92,0.4)" />
        </View>
      )}

      <View style={styles.cardBody}>
        <View style={styles.cardRow}>
          <Text style={styles.cardName}>{room.name}</Text>
          <View style={styles.typeBadge}>
            <Text style={styles.typeBadgeText}>{label}</Text>
          </View>
        </View>

        <View style={styles.cardMeta}>
          <View style={styles.metaItem}>
            <Feather name="maximize-2" size={12} color="#64748b" />
            <Text style={styles.metaText}>{room.area} m²</Text>
          </View>
          <View style={styles.metaItem}>
            <Feather name="grid" size={12} color="#64748b" />
            <Text style={styles.metaText}>
              {room.width} × {room.depth} m
            </Text>
          </View>
          <View style={styles.metaItem}>
            <Feather name="wind" size={12} color="#64748b" />
            <Text style={styles.metaText}>{room.windows} win</Text>
          </View>
          <View style={styles.metaItem}>
            <Feather name="log-in" size={12} color="#64748b" />
            <Text style={styles.metaText}>
              {room.doors} door{room.doors !== 1 ? "s" : ""}
            </Text>
          </View>
        </View>

        <View style={styles.priceRow}>
          <Feather name="tag" size={12} color="#6b705c" />
          <Text style={styles.priceText}>
            Finishing estimate: {priceFormatter.format(room.price_finishing)} EGP
          </Text>
        </View>

        <View style={styles.generateRow}>
          {isLoading ? (
            <ActivityIndicator size="small" color="#c46b4a" />
          ) : (
            <>
              <Text style={styles.generateText}>
                {room.media_asset_id ? "Generate 3D World" : "Preview Only"}
              </Text>
              <Feather
                name={room.media_asset_id ? "arrow-right" : "alert-circle"}
                size={14}
                color={room.media_asset_id ? "#c46b4a" : "#94a3b8"}
              />
            </>
          )}
        </View>
      </View>
    </Pressable>
  );
});

export default function RoomPickerScreen() {
  const { push, back } = useRouter();
  const params = useLocalSearchParams<{
    jobId: string;
    /** @deprecated Large payload; optional for deep links — previews merged when possible */
    rooms?: string;
    style: string;
    palette: string;
    instructions: string;
  }>();

  const jobId = params.jobId ?? "";
  const style = params.style ?? "modern";
  const palette = (params.palette ?? "earth_tones").replace(/_/g, " ");
  const instructions = params.instructions ?? "";

  const legacyRooms = useMemo(() => parseLegacyRoomsParam(params.rooms), [params.rooms]);

  const [rooms, setRooms] = useState<CadRoom[]>([]);
  const [jobStatus, setJobStatus] = useState<string>("");
  const [jobErrorMessage, setJobErrorMessage] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [loadingRoomId, setLoadingRoomId] = useState<string | null>(null);

  useEffect(() => {
    if (!jobId) {
      setListLoading(false);
      setLoadError("Missing job id.");
      return;
    }

    let cancelled = false;

    (async () => {
      setListLoading(true);
      setLoadError(null);
      try {
        const payload = await fetchCadJobRooms(jobId);
        if (cancelled) return;
        setJobStatus(payload.status);
        setJobErrorMessage(payload.error_message);
        setRooms(mergeRoomPreviewsFromLegacy(payload.rooms, legacyRooms));
      } catch (e) {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : "Failed to load rooms.");
        }
      } finally {
        if (!cancelled) setListLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [jobId, legacyRooms]);

  const buildPrompt = useCallback(
    (room: CadRoom) => {
      const roomLabel = (ROOM_TYPE_LABELS[room.type] ?? "room").toLowerCase();
      const base =
        `photorealistic ${roomLabel} interior, ${style} style, ${palette} color palette, ` +
        `perspective view, modern furniture, natural daylight, 8k uhd, high quality`;
      return instructions ? `${base}, ${instructions}` : base;
    },
    [instructions, palette, style]
  );

  const handleRoomSelect = useCallback(
    async (room: CadRoom) => {
      if (!room.media_asset_id) {
        Alert.alert(
          "No 3D Asset",
          "The AI-generated preview for this room could not be uploaded to WorldLabs. " +
            "Please try processing the file again."
        );
        return;
      }

      setLoadingRoomId(room.db_id);
      try {
        const res = await apiFetch("/api/generate", {
          method: "POST",
          body: JSON.stringify({
            media_asset_ids: [room.media_asset_id],
            quality: "full",
            prompt: buildPrompt(room),
            input_mode: "cad_dxf",
          }),
        });

        if (!res.ok) {
          throw new Error(await readApiErrorMessage(res, "Failed to start generation"));
        }

        const data = await res.json();
        const operationId = data?.operation_id as string | undefined;
        if (!operationId) throw new Error("Operation id missing from response");

        push({
          pathname: "/result/[operationId]",
          params: { operationId },
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Something went wrong. Please try again.";
        Alert.alert("Error", message);
      } finally {
        setLoadingRoomId(null);
      }
    },
    [buildPrompt, push]
  );

  const onRoomPress = useCallback(
    (room: CadRoom) => {
      void handleRoomSelect(room);
    },
    [handleRoomSelect]
  );

  const renderItem = useCallback(
    ({ item }: { item: CadRoom }) => (
      <RoomRow
        room={item}
        isLoading={loadingRoomId === item.db_id}
        selectionLocked={loadingRoomId !== null && loadingRoomId !== item.db_id}
        onPress={onRoomPress}
      />
    ),
    [loadingRoomId, onRoomPress]
  );

  const keyExtractor = useCallback((item: CadRoom) => item.db_id, []);

  const listHint = useMemo(
    () => (
      <Text style={styles.listHint}>Tap a room to generate its 3D world with WorldLabs.</Text>
    ),
    []
  );

  if (!jobId || loadError) {
    return (
      <View style={styles.emptyState}>
        <Feather name="alert-circle" size={40} color="#6b705c" />
        <Text style={styles.emptyTitle}>{loadError ? "Could not load rooms" : "Missing job"}</Text>
        <Text style={styles.emptySubtitle}>
          {loadError ||
            "Open this screen from the home tab after processing a DXF, or go back and try again."}
        </Text>
        <Pressable style={styles.backBtn} onPress={() => back()}>
          <Feather name="arrow-left" size={14} color="#fff" />
          <Text style={styles.backBtnText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  if (listLoading) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator size="large" color="#c46b4a" />
        <Text style={styles.loadingText}>Loading rooms…</Text>
      </View>
    );
  }

  if (jobStatus === "error" && jobErrorMessage) {
    return (
      <View style={styles.emptyState}>
        <Feather name="alert-circle" size={40} color="#6b705c" />
        <Text style={styles.emptyTitle}>Processing failed</Text>
        <Text style={styles.emptySubtitle}>{jobErrorMessage}</Text>
        <Pressable style={styles.backBtn} onPress={() => back()}>
          <Feather name="arrow-left" size={14} color="#fff" />
          <Text style={styles.backBtnText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  if (jobStatus === "pending") {
    return (
      <View style={styles.emptyState}>
        <ActivityIndicator size="large" color="#c46b4a" />
        <Text style={styles.emptyTitle}>Still processing</Text>
        <Text style={styles.emptySubtitle}>
          This floor plan job has not finished yet. Pull to refresh from home or wait and open this
          screen again.
        </Text>
        <Pressable style={styles.backBtn} onPress={() => back()}>
          <Feather name="arrow-left" size={14} color="#fff" />
          <Text style={styles.backBtnText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  if (!rooms.length) {
    return (
      <View style={styles.emptyState}>
        <Feather name="alert-circle" size={40} color="#6b705c" />
        <Text style={styles.emptyTitle}>No rooms detected</Text>
        <Text style={styles.emptySubtitle}>
          The AI could not identify any rooms in your DXF file.{"\n"}
          Try a different floor plan or check the file format.
        </Text>
        <Pressable style={styles.backBtn} onPress={() => back()}>
          <Feather name="arrow-left" size={14} color="#fff" />
          <Text style={styles.backBtnText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={() => back()} style={styles.headerBack}>
          <Feather name="arrow-left" size={20} color="#0f172a" />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Pick a Room</Text>
          <Text style={styles.headerSubtitle}>
            {rooms.length} room{rooms.length !== 1 ? "s" : ""} detected
          </Text>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      <FlashList
        data={rooms}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        extraData={loadingRoomId}
        style={styles.listFlex}
        contentContainerStyle={styles.list}
        contentInsetAdjustmentBehavior="automatic"
        ListHeaderComponent={listHint}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#f5f2ed",
  },
  listFlex: {
    flex: 1,
  },
  loadingScreen: {
    flex: 1,
    backgroundColor: "#f5f2ed",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  loadingText: {
    color: "#6b705c",
    fontWeight: "600",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 12,
    backgroundColor: "#f5f2ed",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(107,112,92,0.15)",
  },
  headerBack: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(107,112,92,0.1)",
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
  },
  headerSpacer: {
    width: 36,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0f172a",
  },
  headerSubtitle: {
    fontSize: 12,
    color: "#64748b",
    marginTop: 2,
  },
  list: {
    padding: 16,
    paddingBottom: 40,
  },
  listHint: {
    textAlign: "center",
    color: "#64748b",
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 16,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    marginBottom: 16,
  },
  cardLoading: {
    opacity: 0.6,
  },
  cardImage: {
    width: "100%",
    height: 200,
    backgroundColor: "rgba(107,112,92,0.08)",
  },
  cardImagePlaceholder: {
    alignItems: "center",
    justifyContent: "center",
  },
  cardBody: {
    padding: 14,
    gap: 8,
  },
  cardRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cardName: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0f172a",
    flex: 1,
    marginRight: 8,
  },
  typeBadge: {
    backgroundColor: "rgba(107,112,92,0.12)",
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
  },
  typeBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#6b705c",
  },
  cardMeta: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  metaText: {
    fontSize: 12,
    color: "#475569",
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(107,112,92,0.06)",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  priceText: {
    fontSize: 12,
    color: "#334155",
    fontWeight: "600",
  },
  generateRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 6,
    marginTop: 4,
  },
  generateText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#c46b4a",
  },
  emptyState: {
    flex: 1,
    backgroundColor: "#f5f2ed",
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#0f172a",
    textAlign: "center",
  },
  emptySubtitle: {
    fontSize: 14,
    color: "#64748b",
    textAlign: "center",
    lineHeight: 20,
  },
  backBtn: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#6b705c",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
  },
  backBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 14,
  },
});
