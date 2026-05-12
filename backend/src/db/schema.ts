import { pgTable, uuid, text, timestamp, integer, jsonb, pgEnum } from "drizzle-orm/pg-core";

// ─── Enums ────────────────────────────────────────────────────────────────────

export const qualityEnum = pgEnum("quality", ["draft", "full"]);
export const generationStatusEnum = pgEnum("generation_status", [
  "pending",
  "processing",
  "done",
  "error",
]);

// ─── Better Auth user table (managed by Better Auth, singular name) ───────────

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: timestamp("emailVerified", { withTimezone: true }).notNull(),
  image: text("image"),
  createdAt: timestamp("createdAt", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).notNull(),
});

// ─── Generations ──────────────────────────────────────────────────────────────

export const generations = pgTable("generations", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  operationId: text("operation_id").notNull().unique(),
  worldId: text("world_id"),
  prompt: text("prompt"),
  quality: qualityEnum("quality").notNull().default("full"),
  status: generationStatusEnum("status").notNull().default("pending"),
  errorMessage: text("error_message"),
  spzUrls: jsonb("spz_urls").$type<{
    "100k": string;
    "500k": string;
    full_res: string;
  }>(),
  imageCount: integer("image_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

// ─── Uploaded Assets ──────────────────────────────────────────────────────────

export const uploadedAssets = pgTable("uploaded_assets", {
  id: uuid("id").primaryKey().defaultRandom(),
  generationId: uuid("generation_id").references(() => generations.id, { onDelete: "cascade" }),
  mediaAssetId: text("media_asset_id").notNull(),
  originalName: text("original_name").notNull(),
  mimeType: text("mime_type").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Saved Projects ───────────────────────────────────────────────────────────

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  generationId: uuid("generation_id").references(() => generations.id, { onDelete: "set null" }),
  operationId: text("operation_id"),
  worldId: text("world_id"),
  name: text("name").notNull(),
  status: generationStatusEnum("status").notNull().default("done"),
  caption: text("caption"),
  spzUrls: jsonb("spz_urls").$type<{
    "100k"?: string;
    "500k"?: string;
    full_res?: string;
  }>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── CAD Jobs ─────────────────────────────────────────────────────────────────

export const cadJobs = pgTable("cad_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("pending"), // pending | done | error
  originalFileName: text("original_file_name"),
  areaMqInput: integer("area_m2_input"),
  totalRooms: integer("total_rooms").default(0),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Room Results ──────────────────────────────────────────────────────────────

export const roomResults = pgTable("room_results", {
  id: uuid("id").primaryKey().defaultRandom(),
  cadJobId: uuid("cad_job_id")
    .notNull()
    .references(() => cadJobs.id, { onDelete: "cascade" }),
  roomIndex: integer("room_index").notNull(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  widthM: text("width_m"),
  depthM: text("depth_m"),
  areaMq: text("area_m2"),
  windows: integer("windows"),
  doors: integer("doors"),
  priceFinishing: integer("price_finishing"),
  furnitureJson: jsonb("furniture_json"),
  // WorldLabs media_asset_id for the AI-generated room preview image
  mediaAssetId: text("media_asset_id"),
  /** Raw PNG base64 from CAD pipeline for list thumbnails (no persistent WL URL) */
  previewPngB64: text("preview_png_b64"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Types ────────────────────────────────────────────────────────────────────

export type User = typeof user.$inferSelect;
export type Generation = typeof generations.$inferSelect;
export type UploadedAsset = typeof uploadedAssets.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type NewGeneration = typeof generations.$inferInsert;
export type NewUploadedAsset = typeof uploadedAssets.$inferInsert;
export type NewProject = typeof projects.$inferInsert;
export type CadJob = typeof cadJobs.$inferSelect;
export type RoomResult = typeof roomResults.$inferSelect;
export type NewCadJob = typeof cadJobs.$inferInsert;
export type NewRoomResult = typeof roomResults.$inferInsert;
