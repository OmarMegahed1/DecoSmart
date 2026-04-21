// ─── Media Asset ─────────────────────────────────────────────────────────────

export interface MediaAsset {
  media_asset_id: string;
  file_name: string;
  kind: "image" | "video";
  extension: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface UploadInfo {
  upload_method: string;
  upload_url: string;
  curl_example: string;
  required_headers: Record<string, string>;
}

export interface PrepareUploadResponse {
  media_asset: MediaAsset;
  upload_info: UploadInfo;
}

// ─── World Prompts ────────────────────────────────────────────────────────────

export interface WorldTextPrompt {
  type: "text";
  text_prompt: string;
  disable_recaption?: boolean;
}

export interface ImagePromptSource {
  source: "media_asset";
  media_asset_id: string;
}

export interface WorldImagePrompt {
  type: "image";
  image_prompt: ImagePromptSource;
  text_prompt?: string;
  disable_recaption?: boolean;
}

export interface WorldMultiImagePrompt {
  type: "multi-image";
  multi_image_prompt: Array<{
    content: ImagePromptSource;
  }>;
  text_prompt?: string;
  disable_recaption?: boolean;
}

export type WorldPrompt = WorldTextPrompt | WorldImagePrompt | WorldMultiImagePrompt;

// ─── World / Assets ───────────────────────────────────────────────────────────

export interface SpzUrls {
  "500k": string;
  "100k": string;
  full_res: string;
}

export interface WorldAssets {
  caption: string;
  thumbnail_url: string;
  splats: {
    spz_urls: SpzUrls;
  };
  mesh: {
    collider_mesh_url: string;
  };
  imagery: {
    pano_url: string;
  };
}

export interface World {
  id: string;
  display_name: string;
  tags: string[] | null;
  world_marble_url: string;
  assets: WorldAssets;
  created_at: string | null;
  updated_at: string | null;
  world_prompt: WorldPrompt | null;
  model: string | null;
}

// ─── Operations ───────────────────────────────────────────────────────────────

export type OperationStatus = "IN_PROGRESS" | "SUCCEEDED" | "FAILED" | "CANCELLED";

export interface OperationProgress {
  status: OperationStatus;
  description: string;
}

export interface OperationMetadata {
  progress: OperationProgress;
  world_id: string;
}

export interface OperationError {
  code: number;
  message: string;
}

export interface Operation {
  operation_id: string;
  done: boolean;
  created_at: string | null;
  updated_at: string | null;
  expires_at: string | null;
  error: OperationError | null;
  metadata: OperationMetadata | null;
  response: World | null;
}

// ─── Generate Request ─────────────────────────────────────────────────────────

export interface GenerateWorldRequest {
  world_prompt: WorldPrompt;
  model: string;
  display_name?: string;
}
