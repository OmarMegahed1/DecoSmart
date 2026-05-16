/**
 * Drizzle schema:
 * - TypeScript keys: camelCase (`userId`, `emailVerified`, `createdAt`, …).
 * - SQL columns: snake_case (including `user`; Better Auth maps logical fields via `user.fields` in `better-auth.ts`).
 */
import { relations } from "drizzle-orm";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { pgTable, uuid, text, timestamp, integer, jsonb, pgEnum } from "drizzle-orm/pg-core";

const tz = { withTimezone: true } as const;

// ─── Enums ────────────────────────────────────────────────────────────────────

export const qualityEnum = pgEnum("quality", ["draft", "full"]);
export const generationStatusEnum = pgEnum("generation_status", [
  "pending",
  "processing",
  "done",
  "error",
]);

export const cadJobStatusEnum = pgEnum("cad_job_status", ["pending", "done", "error"]);

// ─── User (Better Auth; column names must match `user.fields` in better-auth.ts) ─

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: timestamp("email_verified", tz).notNull(),
  image: text("image"),
  createdAt: timestamp("created_at", tz).notNull(),
  updatedAt: timestamp("updated_at", tz).notNull(),
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
  createdAt: timestamp("created_at", tz).notNull().defaultNow(),
  completedAt: timestamp("completed_at", tz),
});

// ─── Uploaded assets ───────────────────────────────────────────────────────────

export const uploadedAssets = pgTable("uploaded_assets", {
  id: uuid("id").primaryKey().defaultRandom(),
  generationId: uuid("generation_id").references(() => generations.id, {
    onDelete: "cascade",
  }),
  mediaAssetId: text("media_asset_id").notNull(),
  originalName: text("original_name").notNull(),
  mimeType: text("mime_type").notNull(),
  createdAt: timestamp("created_at", tz).notNull().defaultNow(),
});

// ─── Projects ───────────────────────────────────────────────────────────────────

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  generationId: uuid("generation_id").references(() => generations.id, {
    onDelete: "set null",
  }),
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
  createdAt: timestamp("created_at", tz).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", tz).notNull().defaultNow(),
});

// ─── CAD jobs ───────────────────────────────────────────────────────────────────

export const cadJobs = pgTable("cad_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  status: cadJobStatusEnum("status").notNull().default("pending"),
  originalFileName: text("original_file_name"),
  areaMqInput: integer("area_m2_input"),
  totalRooms: integer("total_rooms").default(0),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", tz).notNull().defaultNow(),
});

// ─── Room results ───────────────────────────────────────────────────────────────

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
  mediaAssetId: text("media_asset_id"),
  previewPngB64: text("preview_png_b64"),
  createdAt: timestamp("created_at", tz).notNull().defaultNow(),
});

// ─── Relations ────────────────────────────────────────────────────────────────

export const userRelations = relations(user, ({ many }) => ({
  generations: many(generations),
  projects: many(projects),
  cadJobs: many(cadJobs),
}));

export const generationsRelations = relations(generations, ({ one, many }) => ({
  user: one(user, {
    fields: [generations.userId],
    references: [user.id],
  }),
  uploadedAssets: many(uploadedAssets),
  projects: many(projects),
}));

export const uploadedAssetsRelations = relations(uploadedAssets, ({ one }) => ({
  generation: one(generations, {
    fields: [uploadedAssets.generationId],
    references: [generations.id],
  }),
}));

export const projectsRelations = relations(projects, ({ one }) => ({
  user: one(user, {
    fields: [projects.userId],
    references: [user.id],
  }),
  generation: one(generations, {
    fields: [projects.generationId],
    references: [generations.id],
  }),
}));

export const cadJobsRelations = relations(cadJobs, ({ one, many }) => ({
  user: one(user, {
    fields: [cadJobs.userId],
    references: [user.id],
  }),
  roomResults: many(roomResults),
}));

export const roomResultsRelations = relations(roomResults, ({ one }) => ({
  cadJob: one(cadJobs, {
    fields: [roomResults.cadJobId],
    references: [cadJobs.id],
  }),
}));

// ─── Zod ────────────────────────────────────────────────────────────────────────

export const insertUserSchema = createInsertSchema(user);
export const selectUserSchema = createSelectSchema(user);

export const insertGenerationSchema = createInsertSchema(generations);
export const selectGenerationSchema = createSelectSchema(generations);

export const insertUploadedAssetSchema = createInsertSchema(uploadedAssets);
export const selectUploadedAssetSchema = createSelectSchema(uploadedAssets);

export const insertProjectSchema = createInsertSchema(projects);
export const selectProjectSchema = createSelectSchema(projects);

export const insertCadJobSchema = createInsertSchema(cadJobs);
export const selectCadJobSchema = createSelectSchema(cadJobs);

export const insertRoomResultSchema = createInsertSchema(roomResults);
export const selectRoomResultSchema = createSelectSchema(roomResults);

// ─── Types ────────────────────────────────────────────────────────────────────────

export type User = typeof user.$inferSelect;
export type NewUser = typeof user.$inferInsert;

export type Generation = typeof generations.$inferSelect;
export type NewGeneration = typeof generations.$inferInsert;

export type UploadedAsset = typeof uploadedAssets.$inferSelect;
export type NewUploadedAsset = typeof uploadedAssets.$inferInsert;

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;

export type CadJob = typeof cadJobs.$inferSelect;
export type NewCadJob = typeof cadJobs.$inferInsert;

export type RoomResult = typeof roomResults.$inferSelect;
export type NewRoomResult = typeof roomResults.$inferInsert;
