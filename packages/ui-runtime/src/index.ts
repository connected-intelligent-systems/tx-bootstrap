export type ThemeMode = "light" | "dark";

export type RuntimeLogoSx = {
  height?: number | string;
  width?: number | string;
  background?: string;
  backgroundColor?: string;
  backgroundImage?: string;
  backgroundPosition?: string;
  backgroundRepeat?: string;
  backgroundSize?: string;
  mask?: string;
  maskImage?: string;
  WebkitMask?: string;
  WebkitMaskImage?: string;
};

type RuntimeColorGroup = {
  main?: string;
  light?: string;
  dark?: string;
  contrastText?: string;
};

export type RuntimePaletteOptions = {
  primary?: RuntimeColorGroup;
  secondary?: RuntimeColorGroup;
  background?: { default?: string; paper?: string };
  text?: { primary?: string; secondary?: string };
  error?: Pick<RuntimeColorGroup, "main">;
  warning?: Pick<RuntimeColorGroup, "main">;
  info?: Pick<RuntimeColorGroup, "main">;
  success?: Pick<RuntimeColorGroup, "main">;
  mode?: ThemeMode;
};

export type RuntimeTypographyOptions = Record<string, unknown>;

export type RuntimeThemeMode = {
  palette?: RuntimePaletteOptions;
  typography?: RuntimeTypographyOptions;
  shape?: { borderRadius?: number };
  spacing?: number;
  sidebarWidth?: number;
  logo?: { src?: string; alt?: string; sx?: RuntimeLogoSx };
};

export const alertPalette = {
  error: { main: "#E53935" },
  warning: { main: "#FFB74D" },
  info: { main: "#29B6F6" },
  success: { main: "#66BB6A" },
} satisfies Pick<
  RuntimePaletteOptions,
  "error" | "warning" | "info" | "success"
>;

export const fallbackPalettes: Record<ThemeMode, RuntimePaletteOptions> = {
  light: {
    primary: { main: "#0043ce" },
    secondary: { main: "#1D49B8" },
    background: { default: "#ffffff", paper: "#ffffff" },
    text: { primary: "#544f5a", secondary: "#89868D" },
    ...alertPalette,
    mode: "light",
  },
  dark: {
    primary: { main: "#9055fd" },
    secondary: { main: "#FF83F6" },
    background: { default: "#110e1c", paper: "#151221" },
    text: { primary: "#f3f0ff", secondary: "#c5bdd8" },
    ...alertPalette,
    mode: "dark",
  },
};

export const baseTypography: RuntimeTypographyOptions = {
  h1: { fontWeight: 500, fontSize: "6rem" },
  h2: { fontWeight: 600 },
  h3: { fontWeight: 700 },
  h4: { fontWeight: 800 },
  h5: { fontWeight: 900 },
  button: { textTransform: "none", fontWeight: 700 },
};

export function mergePalette(
  base: RuntimePaletteOptions,
  override: RuntimeThemeMode["palette"],
): RuntimePaletteOptions {
  return {
    ...base,
    ...override,
    primary: { ...base.primary, ...override?.primary },
    secondary: { ...base.secondary, ...override?.secondary },
    background: { ...base.background, ...override?.background },
    text: { ...base.text, ...override?.text },
    error: { ...base.error, ...override?.error },
    warning: { ...base.warning, ...override?.warning },
    info: { ...base.info, ...override?.info },
    success: { ...base.success, ...override?.success },
  };
}

export function mergeObjects<T>(base: T, override: T | undefined): T {
  if (!override || typeof override !== "object") return base;
  return { ...base, ...override };
}

export function hasVisibleLogo(logo?: RuntimeThemeMode["logo"]) {
  return Boolean(
    logo?.src ||
    logo?.sx?.background ||
    logo?.sx?.backgroundImage ||
    logo?.sx?.mask ||
    logo?.sx?.maskImage ||
    logo?.sx?.WebkitMask ||
    logo?.sx?.WebkitMaskImage,
  );
}

export function logoStyle(sx?: RuntimeLogoSx) {
  if (!sx) return undefined;
  return {
    ...sx,
    height: toCssSize(sx.height),
    width: toCssSize(sx.width),
  };
}

export function toCssSize(value: number | string | undefined) {
  if (typeof value === "number") return String(value) + "px";
  return value;
}
