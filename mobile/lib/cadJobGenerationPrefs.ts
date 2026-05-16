import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * CAD flow: style / palette / instructions must not travel in the URL (length & encoding on web).
 * Persisted so a cold start / process kill after CAD but before the room picker still restores prefs.
 */
export type CadJobGenerationPrefs = {
  style: string;
  /** Same as home screen palette id, e.g. `earth_tones` */
  palette: string;
  instructions: string;
};

const memory = new Map<string, CadJobGenerationPrefs>();

const storageKey = (jobId: string) => `decor-ai:cad-gen-prefs:v1:${jobId}`;

function parsePrefsJson(raw: string): CadJobGenerationPrefs | null {
  try {
    const parsed = JSON.parse(raw) as CadJobGenerationPrefs;
    if (parsed && typeof parsed.style === "string" && typeof parsed.palette === "string") {
      return {
        style: parsed.style,
        palette: parsed.palette,
        instructions: typeof parsed.instructions === "string" ? parsed.instructions : "",
      };
    }
  } catch {
    /* ignore */
  }
  return null;
}

function writeSession(jobId: string, prefs: CadJobGenerationPrefs): void {
  try {
    if (typeof globalThis !== "undefined" && "sessionStorage" in globalThis) {
      globalThis.sessionStorage.setItem(storageKey(jobId), JSON.stringify(prefs));
    }
  } catch {
    /* private mode / quota */
  }
}

function readSession(jobId: string): CadJobGenerationPrefs | null {
  try {
    if (typeof globalThis !== "undefined" && "sessionStorage" in globalThis) {
      const raw = globalThis.sessionStorage.getItem(storageKey(jobId));
      if (raw) return parsePrefsJson(raw);
    }
  } catch {
    /* ignore */
  }
  return null;
}

/** Load from AsyncStorage (native + web via RN polyfill); fills memory for subsequent sync reads. */
export async function readCadJobGenerationPrefsFromDisk(jobId: string): Promise<CadJobGenerationPrefs | null> {
  if (!jobId) return null;
  try {
    const raw = await AsyncStorage.getItem(storageKey(jobId));
    if (!raw) return null;
    const parsed = parsePrefsJson(raw);
    if (parsed) memory.set(jobId, parsed);
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Await before `router.push` so native disk write finishes before the next screen reads.
 */
export async function setCadJobGenerationPrefs(
  jobId: string,
  prefs: CadJobGenerationPrefs
): Promise<void> {
  memory.set(jobId, prefs);
  writeSession(jobId, prefs);
  try {
    await AsyncStorage.setItem(storageKey(jobId), JSON.stringify(prefs));
  } catch {
    /* disk full / permission */
  }
}

/** Resolve prefs for a job (in-memory + session); does not hit AsyncStorage. */
export function getCadJobGenerationPrefs(jobId: string): CadJobGenerationPrefs | null {
  const m = memory.get(jobId);
  if (m) return m;
  const s = readSession(jobId);
  if (s) {
    memory.set(jobId, s);
    return s;
  }
  return null;
}
