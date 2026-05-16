/**
 * Caps system font scaling so accessibility “largest text” does not blow up layouts
 * (especially viewer chrome and tight toolbars). Still allows ~12–18% growth.
 */
import { Platform, Text, TextInput } from "react-native";

const MAX_MULTI = Platform.OS === "web" ? 1.12 : 1.18;

type WithDefault = { defaultProps?: { maxFontSizeMultiplier?: number } };

function setMaxFont(TextComp: typeof Text | typeof TextInput) {
  const ctor = TextComp as unknown as WithDefault;
  ctor.defaultProps = {
    ...ctor.defaultProps,
    maxFontSizeMultiplier: MAX_MULTI,
  };
}

setMaxFont(Text);
setMaxFont(TextInput);

export {};
