import { Platform } from "react-native";
import { File, Paths } from "expo-file-system";

export type SplatQuality = "100k" | "500k" | "full_res";

/** Full-res splats are often hundreds of MB — too large for mobile JS + WebView data URLs. */
export function defaultSplatQuality(): SplatQuality {
  return Platform.OS === "web" ? "full_res" : "100k";
}

/** Above this size, native SPZ handling risks OOM (RAM + GPU) even with file cache. */
export const NATIVE_SPZ_SOFT_MAX_BYTES = 40 * 1024 * 1024;

export function isSpzTooLargeForNative(byteLength: number): boolean {
  return Platform.OS !== "web" && byteLength > NATIVE_SPZ_SOFT_MAX_BYTES;
}

const WRITE_CHUNK_BYTES = 2 * 1024 * 1024;

/**
 * Converts downloaded SPZ bytes into a URL Spark can load inside the WebView.
 * - Web: data URL (same-origin, small caches only on typical dev machines).
 * - iOS/Android: write to app cache and return `file://` URI to avoid giant in-memory base64 strings.
 */
export async function spzBufferToViewerUrl(cacheKey: string, rawBuffer: ArrayBuffer): Promise<string> {
  if (Platform.OS === "web") {
    const blob = new Blob([rawBuffer], { type: "application/octet-stream" });
    return await new Promise<string>((resolve, reject) => {
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
  }

  const safeKey = cacheKey.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 120);
  const file = new File(Paths.cache, `splat-${safeKey}.spz`);
  if (file.exists) {
    file.delete();
  }

  const writer = file.writableStream().getWriter();
  const u8 = new Uint8Array(rawBuffer);
  try {
    for (let offset = 0; offset < u8.byteLength; offset += WRITE_CHUNK_BYTES) {
      await writer.write(u8.subarray(offset, Math.min(offset + WRITE_CHUNK_BYTES, u8.byteLength)));
    }
  } finally {
    await writer.close();
  }

  return file.uri;
}

/** iOS WKWebView needs read access to the cache dir when loading `file://` assets from injected HTML. */
export function webViewCacheReadAccessUrl(): string | undefined {
  return Platform.OS === "ios" ? Paths.cache.uri : undefined;
}
