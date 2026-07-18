import {
  alpha,
  createTheme,
  type PaletteOptions,
  type ThemeOptions,
} from "@mui/material/styles";
import {
  baseTypography,
  fallbackPalettes,
  logoStyle,
  mergeObjects,
  mergePalette,
} from "@tx-bootstrap/ui-runtime";
import { consoleConfig } from "./config";
import type { ThemeMode } from "./types";

const consoleTypography: ThemeOptions["typography"] = mergeObjects(
  baseTypography,
  { fontFamily: "'Geist Variable', sans-serif" },
);

export function createConsoleTheme(mode: ThemeMode) {
  const overrides = consoleConfig.theme?.[mode] ?? {};
  const palette = mergePalette(
    fallbackPalettes[mode],
    overrides.palette,
  ) as PaletteOptions;
  palette.mode = mode;

  const theme = createTheme({
    palette,
    spacing: overrides.spacing ?? 10,
    shape: { borderRadius: 0, ...overrides.shape },
    typography: mergeObjects(consoleTypography, overrides.typography),
  });

  theme.components = {
    MuiAppBar: {
      styleOverrides: {
        colorSecondary: {
          backgroundColor: theme.palette.background.default,
          color: theme.palette.text.primary,
        },
      },
    },
    MuiButton: {
      defaultProps: { variant: "outlined" },
      styleOverrides: {
        sizeSmall: {
          padding: `${theme.spacing(0.5)} ${theme.spacing(1.5)}`,
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { borderRadius: 4, fontWeight: 700 },
      },
    },
    MuiPaper: {
      styleOverrides: {
        elevation1: {
          boxShadow: `${alpha(
            theme.palette.primary.main,
            0.2,
          )} -2px 2px, ${alpha(
            theme.palette.primary.main,
            0.1,
          )} -4px 4px, ${alpha(theme.palette.primary.main, 0.05)} -6px 6px`,
        },
        root: {
          backgroundClip: "padding-box",
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          padding: theme.spacing(1.5),
          borderColor: alpha(theme.palette.text.primary, 0.12),
        },
        head: {
          color: theme.palette.text.secondary,
          fontSize: "0.75rem",
          fontWeight: 700,
        },
        sizeSmall: { padding: theme.spacing(1) },
      },
    },
    MuiTextField: {
      defaultProps: { size: "small", variant: "outlined" },
    },
    MuiFormControl: {
      defaultProps: { size: "small" },
    },
    MuiTab: {
      styleOverrides: {
        root: { minHeight: 44, textTransform: "none", fontWeight: 700 },
      },
    },
  };

  return {
    theme,
    logo: overrides.logo ?? consoleConfig.theme?.light?.logo,
  };
}
export { logoStyle };
