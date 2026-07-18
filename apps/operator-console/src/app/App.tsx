import { useEffect, useMemo, useState } from "react";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import LightModeIcon from "@mui/icons-material/LightMode";
import ShieldOutlinedIcon from "@mui/icons-material/ShieldOutlined";
import {
  AppBar,
  Box,
  Container,
  CssBaseline,
  IconButton,
  Stack,
  Toolbar,
  Tooltip,
  Typography,
} from "@mui/material";
import { alpha, ThemeProvider } from "@mui/material/styles";
import { ParticipantsPage } from "@/features/participants/components/participants-page";
import { consoleConfig } from "@/config";
import { initialThemeMode, persistThemeMode } from "@/storage";
import { createConsoleTheme, logoStyle } from "@/theme";
import type { ThemeMode } from "@/types";

const title = consoleConfig.title?.trim() || "Participant Operations";
const subtitle = consoleConfig.subtitle?.trim() || "Dataspace Administration";

export default function App() {
  const [themeMode, setThemeMode] = useState<ThemeMode>(() =>
    initialThemeMode(),
  );
  const { theme, logo } = useMemo(
    () => createConsoleTheme(themeMode),
    [themeMode],
  );
  useEffect(() => {
    document.title = title;
  }, []);

  function toggleTheme() {
    setThemeMode((current) => {
      const next = current === "dark" ? "light" : "dark";
      persistThemeMode(next);
      return next;
    });
  }

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box
        sx={{
          minHeight: "100vh",
          bgcolor: "background.default",
          color: "text.primary",
          backgroundImage:
            theme.palette.mode === "dark"
              ? `radial-gradient(circle at top left, ${alpha(
                  theme.palette.primary.main,
                  0.16,
                )}, transparent 32rem)`
              : `linear-gradient(180deg, ${alpha(
                  theme.palette.primary.main,
                  0.04,
                )}, transparent 18rem)`,
        }}
      >
        <ShellBar
          logo={logo}
          themeMode={themeMode}
          onToggleTheme={toggleTheme}
        />
        <Container
          component="main"
          maxWidth="xl"
          sx={{
            display: "flex",
            flexDirection: "column",
            gap: 2.5,
            py: { xs: 2, md: 3 },
          }}
        >
          <ParticipantsPage />
        </Container>
      </Box>
    </ThemeProvider>
  );
}

function ShellBar({
  logo,
  themeMode,
  onToggleTheme,
}: {
  logo?: {
    src?: string;
    alt?: string;
    sx?: { height?: number | string; width?: number | string };
  };
  themeMode: ThemeMode;
  onToggleTheme: () => void;
}) {
  return (
    <AppBar
      position="sticky"
      color="secondary"
      elevation={0}
      sx={(theme) => ({
        backgroundImage: "none",
        borderBottom: `1px solid ${alpha(theme.palette.text.primary, 0.12)}`,
      })}
    >
      <Toolbar
        sx={{ gap: 2, minHeight: { xs: 64, md: 72 }, px: { xs: 2, sm: 3 } }}
      >
        <Brand logo={logo} />
        <Box sx={{ flex: 1 }} />
        <Tooltip
          title={themeMode === "dark" ? "Use light theme" : "Use dark theme"}
        >
          <IconButton
            aria-label="Toggle theme"
            onClick={onToggleTheme}
            color="inherit"
          >
            {themeMode === "dark" ? <LightModeIcon /> : <DarkModeIcon />}
          </IconButton>
        </Tooltip>
      </Toolbar>
    </AppBar>
  );
}

function Brand({
  logo,
}: {
  logo?: {
    src?: string;
    alt?: string;
    sx?: { height?: number | string; width?: number | string };
  };
}) {
  return (
    <Stack
      direction="row"
      spacing={1.5}
      sx={{ alignItems: "center", minWidth: { xs: 0, md: 280 } }}
    >
      {logo?.src ? (
        <Box
          component="img"
          src={logo.src}
          alt={logo.alt ?? title}
          sx={{ maxHeight: 36, ...logoStyle(logo.sx) }}
        />
      ) : (
        <Box
          sx={(theme) => ({
            alignItems: "center",
            bgcolor: alpha(theme.palette.primary.main, 0.12),
            color: "primary.main",
            display: "flex",
            height: 36,
            justifyContent: "center",
            width: 36,
          })}
        >
          <ShieldOutlinedIcon fontSize="small" />
        </Box>
      )}
      <Box sx={{ minWidth: 0 }}>
        <Typography
          variant="caption"
          color="primary"
          sx={{ display: "block", fontWeight: 700, lineHeight: 1.2 }}
        >
          {subtitle}
        </Typography>
        <Typography variant="subtitle1" noWrap sx={{ fontWeight: 700 }}>
          {title}
        </Typography>
      </Box>
    </Stack>
  );
}
