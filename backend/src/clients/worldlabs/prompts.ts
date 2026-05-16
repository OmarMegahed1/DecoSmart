/** WorldLabs Marble `text_prompt` hard limit (API). */
export const WORLDLABS_TEXT_PROMPT_MAX_CHARS = 2000;

type CadOptions =
  | {
      preserve_layout?: boolean;
      style_hint?: string;
      room_height_m?: number;
    }
  | undefined;

type InputMode = "photo" | "cad_dxf";

/**
 * CAD layout instructions prepended to the client `prompt` before calling WorldLabs.
 * Keep in sync with `postGenerate` — this is the single source of truth for that prefix.
 */
export function buildCadContextText(cad_options: CadOptions): string {
  return [
    "Input source is AutoCAD/floor-plan line art.",
    cad_options?.preserve_layout !== false
      ? "Strictly preserve wall topology, room boundaries, and openings."
      : "Preserve primary spatial layout.",
    "Do not add, remove, merge, or reposition rooms, walls, doors, windows, or corridors.",
    "Keep camera framing and scale consistent with the provided plan-derived image.",
    "Generate one coherent navigable interior 3D space from this single structural reference.",
    cad_options?.style_hint ? `Style hint: ${cad_options.style_hint}.` : "",
    cad_options?.room_height_m != null ? `Assume room height ${cad_options.room_height_m}m.` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

/** Character length of the longest possible CAD prefix (for client-side budget). */
export const WORLDLABS_CAD_CONTEXT_WORST_CASE_CHARS = buildCadContextText({
  preserve_layout: true,
  style_hint: "x".repeat(120),
  room_height_m: 6,
}).length;

export function buildWorldlabsFinalPrompt(parts: {
  input_mode: InputMode;
  prompt?: string | null;
  cad_options?: CadOptions;
}): string {
  const cad = parts.input_mode === "cad_dxf" ? buildCadContextText(parts.cad_options) : "";
  return [cad, (parts.prompt ?? "").trim()].filter(Boolean).join(" ").trim();
}

export function isWorldlabsPromptTooLong(finalPrompt: string): boolean {
  return finalPrompt.length > WORLDLABS_TEXT_PROMPT_MAX_CHARS;
}
