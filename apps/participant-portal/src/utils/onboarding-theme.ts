import { alpha, createTheme, type PaletteOptions } from '@mui/material/styles'
import { baseTypography, fallbackPalettes, logoStyle, mergeObjects, mergePalette } from '@tx-bootstrap/ui-runtime'
import type { ThemeMode } from '../types/onboarding'

const portalConfig = window.config ?? {}

export function createGatewayTheme(mode: ThemeMode) {
  const overrides = portalConfig.theme?.[mode] ?? {}
  const palette = mergePalette(fallbackPalettes[mode], overrides.palette) as PaletteOptions
  palette.mode = mode

  const theme = createTheme({
    palette,
    spacing: overrides.spacing ?? 10,
    shape: { borderRadius: 0, ...overrides.shape },
    typography: mergeObjects(baseTypography, overrides.typography),
  })

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
      defaultProps: { variant: 'outlined' },
      styleOverrides: {
        sizeSmall: {
          padding: `${theme.spacing(0.5)} ${theme.spacing(1.5)}`,
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        elevation1: {
          boxShadow: `${alpha(theme.palette.primary.main, 0.2)} -2px 2px, ${alpha(
            theme.palette.primary.main,
            0.1,
          )} -4px 4px, ${alpha(theme.palette.primary.main, 0.05)} -6px 6px`,
        },
        root: {
          backgroundClip: 'padding-box',
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: { padding: theme.spacing(1.5) },
        sizeSmall: { padding: theme.spacing(1) },
      },
    },
  }

  return {
    theme,
    logo: overrides.logo ?? portalConfig.theme?.light?.logo,
  }
}

export { logoStyle }
