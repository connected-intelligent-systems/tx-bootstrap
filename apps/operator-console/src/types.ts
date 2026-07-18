import type {
  RuntimeLogoSx,
  RuntimeThemeMode,
  ThemeMode,
} from "@tx-bootstrap/ui-runtime";

export type { ThemeMode };

export type ConsoleLogoSx = RuntimeLogoSx;

export type ConsoleThemeMode = RuntimeThemeMode;

export type ConsoleConfig = {
  title?: string;
  subtitle?: string;
  theme?: {
    light?: ConsoleThemeMode;
    dark?: ConsoleThemeMode;
  };
};

declare global {
  interface Window {
    config?: ConsoleConfig;
  }
}
