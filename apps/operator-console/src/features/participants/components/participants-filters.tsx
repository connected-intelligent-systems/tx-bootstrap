import { useState } from "react";
import {
  Box,
  Button,
  Collapse,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import ClearIcon from "@mui/icons-material/Clear";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import TuneIcon from "@mui/icons-material/Tune";
import type { ParticipantFilters } from "../api/participants-api";

interface ParticipantsFiltersProps {
  onFiltersChange: (filters: ParticipantFilters) => void;
}

export function ParticipantsFilters({
  onFiltersChange,
}: ParticipantsFiltersProps) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false);
  const [sort, setSort] = useState<"created_at" | "updated_at" | "legal_name">(
    "updated_at",
  );
  const [order, setOrder] = useState<"asc" | "desc">("desc");

  const handleApply = () => {
    const filters: ParticipantFilters = {
      ...(search ? { search } : {}),
      ...(status ? { status } : {}),
      sort,
      order,
    };
    onFiltersChange(filters);
  };

  const handleClear = () => {
    setSearch("");
    setStatus("");
    setSort("updated_at");
    setOrder("desc");
    setMoreFiltersOpen(false);
    onFiltersChange({ sort: "updated_at", order: "desc" });
  };

  const hasActiveFilters = Boolean(search || status);

  return (
    <Paper sx={{ p: 2, mb: 2 }}>
      <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
        <TextField
          label="Search"
          placeholder="Name, BPN, or email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") handleApply();
          }}
          size="small"
          sx={{ flex: 1, minWidth: 200 }}
          slotProps={{
            input: {
              startAdornment: (
                <SearchIcon sx={{ mr: 1, color: "text.secondary" }} />
              ),
            },
          }}
        />

        <FormControl size="small" sx={{ minWidth: 150 }}>
          <InputLabel>Sort By</InputLabel>
          <Select
            value={sort}
            onChange={(e) => setSort(e.target.value as typeof sort)}
            label="Sort By"
          >
            <MenuItem value="updated_at">Updated</MenuItem>
            <MenuItem value="created_at">Created</MenuItem>
            <MenuItem value="legal_name">Name</MenuItem>
          </Select>
        </FormControl>

        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel>Order</InputLabel>
          <Select
            value={order}
            onChange={(e) => setOrder(e.target.value as typeof order)}
            label="Order"
          >
            <MenuItem value="desc">Newest</MenuItem>
            <MenuItem value="asc">Oldest</MenuItem>
          </Select>
        </FormControl>

        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
          <Button
            variant="contained"
            onClick={handleApply}
            startIcon={<SearchIcon />}
          >
            Apply
          </Button>
          {hasActiveFilters && (
            <Button
              variant="outlined"
              onClick={handleClear}
              startIcon={<ClearIcon />}
            >
              Clear
            </Button>
          )}
          <Button
            variant="outlined"
            color={status ? "primary" : "inherit"}
            onClick={() => setMoreFiltersOpen((current) => !current)}
            startIcon={<TuneIcon />}
            endIcon={moreFiltersOpen ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            aria-expanded={moreFiltersOpen}
            aria-controls="participant-more-filters"
            sx={{ whiteSpace: "nowrap" }}
          >
            More filters{status ? " (1)" : ""}
          </Button>
        </Box>
      </Stack>
      <Collapse in={moreFiltersOpen}>
        <Box id="participant-more-filters" sx={{ display: "flex", pt: 2 }}>
          <FormControl size="small" sx={{ minWidth: 220 }}>
            <InputLabel>Participant status</InputLabel>
            <Select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              label="Participant status"
            >
              <MenuItem value="">All statuses</MenuItem>
              <MenuItem value="UNVERIFIED">Unverified</MenuItem>
              <MenuItem value="IN_REVIEW">In review</MenuItem>
              <MenuItem value="VERIFIED">Verified</MenuItem>
              <MenuItem value="REJECTED">Rejected</MenuItem>
            </Select>
          </FormControl>
        </Box>
      </Collapse>
    </Paper>
  );
}
