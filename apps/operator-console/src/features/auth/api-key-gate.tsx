import { useState, type FormEvent, type ReactNode } from "react";
import KeyOutlinedIcon from "@mui/icons-material/KeyOutlined";
import {
  Alert,
  Box,
  Button,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useQueryClient } from "@tanstack/react-query";
import { setApiKey, useApiKey, wasApiKeyRejected } from "./api-key";

// Asks for the console API key before showing the console; a key the server
// rejects is forgotten (see api-key.ts), which shows this prompt again.
export function ApiKeyGate({ children }: { children: ReactNode }) {
  const apiKey = useApiKey();
  const queryClient = useQueryClient();
  const [value, setValue] = useState("");

  if (apiKey) return <>{children}</>;
  const rejected = wasApiKeyRejected();

  function submit(event: FormEvent) {
    event.preventDefault();
    const key = value.trim();
    if (!key) return;
    queryClient.clear();
    setApiKey(key);
    setValue("");
  }

  return (
    <Box
      sx={{ display: "flex", justifyContent: "center", pt: { xs: 4, md: 10 } }}
    >
      <Paper
        component="form"
        onSubmit={submit}
        variant="outlined"
        sx={{ p: { xs: 3, md: 4 }, width: "100%", maxWidth: 440 }}
      >
        <Stack spacing={2.5}>
          <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
            <KeyOutlinedIcon color="primary" />
            <Typography variant="h6" component="h1">
              Console API key
            </Typography>
          </Stack>
          <Typography variant="body2" color="text.secondary">
            This console requires the operator's API key
            (OPERATOR_CONSOLE_API_KEY). It is kept for this browser tab only.
          </Typography>
          {rejected && (
            <Alert severity="warning">
              The key was not accepted or has expired. Enter it again.
            </Alert>
          )}
          <TextField
            label="API key"
            type="password"
            autoComplete="off"
            autoFocus
            fullWidth
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
          <Button type="submit" variant="contained" disabled={!value.trim()}>
            Continue
          </Button>
        </Stack>
      </Paper>
    </Box>
  );
}
