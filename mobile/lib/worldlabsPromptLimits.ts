/**
 * WorldLabs Marble `text_prompt` limit — keep in sync with backend `worldlabsPromptLimits.ts`.
 */
export const WORLDLABS_TEXT_PROMPT_MAX_CHARS = 2000;

/** Must match `WORLDLABS_CAD_CONTEXT_WORST_CASE_CHARS` in backend (longest CAD prefix). */
export const WORLDLABS_CAD_CONTEXT_WORST_CASE_CHARS = 518;

/**
 * Conservative upper bound for room-picker `buildPrompt` template (no user instructions),
 * including commas — used to size the instructions field on the home screen for CAD flow.
 */
export const CAD_ROOM_PROMPT_BASE_WORST_CHARS = 360;

const PHOTO_CUSTOM_PREFIX = "Custom instructions: ";

export function photoPromptBaseLength(args: {
  roomType: string;
  styleType: string;
  palette: string;
  photoCount: number;
}): number {
  const { roomType, styleType, palette, photoCount } = args;
  return [
    `Room type: ${roomType.replace("_", " ")}.`,
    `Style: ${styleType}.`,
    `Color palette: ${palette.replace("_", " ")}.`,
    `Input photos: ${photoCount}.`,
  ].join(" ").length;
}

/** Max characters for the custom-instructions box in photo mode (full prompt must fit in WorldLabs limit). */
export function maxPhotoInstructionChars(args: {
  roomType: string;
  styleType: string;
  palette: string;
  photoCount: number;
}): number {
  const base = photoPromptBaseLength(args);
  return Math.max(0, WORLDLABS_TEXT_PROMPT_MAX_CHARS - base - PHOTO_CUSTOM_PREFIX.length);
}

/** Max characters for custom instructions when the text is later merged into the room-picker prompt + CAD prefix. */
export function maxCadInstructionCharsFromHome(): number {
  const joinSpace = 1;
  return Math.max(
    0,
    WORLDLABS_TEXT_PROMPT_MAX_CHARS -
      WORLDLABS_CAD_CONTEXT_WORST_CASE_CHARS -
      joinSpace -
      CAD_ROOM_PROMPT_BASE_WORST_CHARS
  );
}
