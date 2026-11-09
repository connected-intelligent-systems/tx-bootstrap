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
  // OPERATOR_CONSOLE_AUTH_MODE=api-key: the UI asks for the key.
  apiKeyRequired?: boolean;
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
