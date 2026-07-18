import { useMemo, useState } from "react";
import AddIcon from "@mui/icons-material/Add";
import RefreshIcon from "@mui/icons-material/Refresh";
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createParticipant,
  getParticipant,
  listParticipants,
  retryTechnicalSetup,
  updateParticipantOrganization,
  updateTechnicalMetadata,
  type ParticipantFilters,
} from "../api/participants-api";
import type {
  Participant,
  ParticipantOrganizationUpdate,
  TechnicalMetadataUpdate,
} from "../types";
import {
  deriveParticipantTask,
  isParticipantActive,
  participantTaskQueues,
  type ParticipantTaskQueue,
} from "../participant-tasks";
import { CreateParticipantDialog } from "./create-participant-dialog";
import { DashboardStats } from "./dashboard-stats";
import { ParticipantDrawer, type DrawerTab } from "./participant-detail-drawer";
import { ParticipantInviteDialog } from "./participant-invite-dialog";
import { ParticipantTaskWorkspace } from "./participant-task-workspace";
import { ParticipantsFilters } from "./participants-filters";
import { ErrorAlert, MonoText, StatusChip } from "./participant-ui";

export function ParticipantsPage() {
  const queryClient = useQueryClient();
  const [detailId, setDetailId] = useState("");
  const [taskId, setTaskId] = useState("");
  const [drawerTab, setDrawerTab] = useState<DrawerTab>(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [lastInvite, setLastInvite] = useState<Awaited<
    ReturnType<typeof createParticipant>
  > | null>(null);
  const [activeQueue, setActiveQueue] = useState<ParticipantTaskQueue | "all">(
    "all",
  );
  const [filters, setFilters] = useState<ParticipantFilters>({
    sort: "updated_at",
    order: "desc",
  });

  const participantsQuery = useQuery({
    queryKey: ["participants", filters],
    queryFn: () => listParticipants(filters),
    refetchInterval: 15000,
  });
  const participants = useMemo(
    () => participantsQuery.data ?? [],
    [participantsQuery.data],
  );
  const participantRows = useMemo(
    () =>
      participants.map((participant) => ({
        participant,
        task: deriveParticipantTask(participant),
      })),
    [participants],
  );
  const queueCounts = useMemo(() => {
    const counts: Record<ParticipantTaskQueue, number> & { active: number } = {
      admin: 0,
      failed: 0,
      waiting: 0,
      done: 0,
      active: 0,
    };
    for (const row of participantRows) {
      if (row.task.isAdminAction) counts.admin += 1;
      counts[row.task.queue] += 1;
      if (isParticipantActive(row.participant)) counts.active += 1;
    }
    return counts;
  }, [participantRows]);
  const visibleRows = useMemo(() => {
    if (activeQueue === "all") return participantRows;
    if (activeQueue === "admin")
      return participantRows.filter((row) => row.task.isAdminAction);
    return participantRows.filter((row) => row.task.queue === activeQueue);
  }, [activeQueue, participantRows]);

  const selectedId = taskId || detailId;
  const selectedQuery = useQuery({
    queryKey: ["participant", selectedId],
    queryFn: () => getParticipant(selectedId),
    enabled: Boolean(selectedId),
  });
  const selectedParticipant =
    selectedQuery.data ??
    participants.find((item) => item.id === selectedId) ??
    null;

  function syncParticipant(participant: Participant) {
    queryClient.setQueryData(["participant", participant.id], participant);
    queryClient.invalidateQueries({ queryKey: ["participants"] });
  }

  const createMutation = useMutation({
    mutationFn: createParticipant,
    onSuccess: (invite) => {
      setLastInvite(invite);
      setCreateOpen(false);
      queryClient.invalidateQueries({ queryKey: ["participants"] });
    },
  });
  const updateOrganizationMutation = useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: string;
      body: ParticipantOrganizationUpdate;
    }) => updateParticipantOrganization(id, body),
    onSuccess: syncParticipant,
  });
  const retryTechnicalMutation = useMutation({
    mutationFn: retryTechnicalSetup,
    onSuccess: syncParticipant,
  });
  const updateTechnicalMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: TechnicalMetadataUpdate }) =>
      updateTechnicalMetadata(id, body),
    onSuccess: syncParticipant,
  });

  const taskBusy =
    retryTechnicalMutation.isPending || updateTechnicalMutation.isPending;
  const detailSaving =
    updateOrganizationMutation.isPending || updateTechnicalMutation.isPending;

  function openDetails(id: string) {
    setTaskId("");
    setDetailId(id);
    setDrawerTab(0);
  }

  function openTask(id: string) {
    setDetailId("");
    setTaskId(id);
  }

  function handleTaskResult(participant: Participant) {
    const nextTask = deriveParticipantTask(participant);
    if (!nextTask.taskKind) setTaskId("");
  }

  if (taskId) {
    if (selectedQuery.error) {
      return (
        <Stack spacing={2}>
          <Button
            onClick={() => setTaskId("")}
            sx={{ alignSelf: "flex-start" }}
          >
            Back to work queue
          </Button>
          <ErrorAlert
            title="Could not load participant task"
            error={selectedQuery.error}
          />
        </Stack>
      );
    }

    if (!selectedParticipant) {
      return (
        <Stack sx={{ alignItems: "center", py: 8 }}>
          <CircularProgress aria-label="Loading participant task" />
        </Stack>
      );
    }

    const task = deriveParticipantTask(selectedParticipant);
    return (
      <ParticipantTaskWorkspace
        busy={taskBusy || selectedQuery.isFetching}
        participant={selectedParticipant}
        task={task}
        onBack={() => setTaskId("")}
        onRetry={() => retryTechnicalMutation.mutateAsync(taskId)}
        onSaveTechnical={(body) =>
          updateTechnicalMutation.mutateAsync({ id: taskId, body })
        }
        onTaskResult={handleTaskResult}
      />
    );
  }

  return (
    <Stack spacing={2.5}>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={2}
        sx={{
          alignItems: { sm: "flex-start" },
          justifyContent: "space-between",
        }}
      >
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 800 }}>
            Participants
          </Typography>
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ mt: 0.5, maxWidth: 760 }}
          >
            Operator view for participant registration, connector setup,
            credentials, and activation.
          </Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button
            size="small"
            startIcon={<RefreshIcon />}
            onClick={() => participantsQuery.refetch()}
          >
            Refresh
          </Button>
          <Button
            size="small"
            startIcon={<AddIcon />}
            onClick={() => {
              createMutation.reset();
              setCreateOpen(true);
            }}
          >
            New participant
          </Button>
        </Stack>
      </Stack>

      {participantsQuery.error ? (
        <ErrorAlert
          title="Could not load participants"
          error={participantsQuery.error}
        />
      ) : null}

      <DashboardStats
        counts={{
          total: participantRows.length,
          needsAdminAction: queueCounts.admin,
          inProgress: queueCounts.waiting,
          active: queueCounts.active,
        }}
      />

      <ParticipantsFilters onFiltersChange={setFilters} />

      <Paper variant="outlined" sx={{ p: 1.5 }}>
        <Stack
          direction="row"
          spacing={1}
          useFlexGap
          sx={{ alignItems: "center", flexWrap: "wrap" }}
        >
          <Typography variant="subtitle2" sx={{ fontWeight: 850, mr: 0.5 }}>
            Work queue
          </Typography>
          <Chip
            clickable
            color={activeQueue === "all" ? "primary" : "default"}
            label={`All participants (${participantRows.length})`}
            onClick={() => setActiveQueue("all")}
            aria-pressed={activeQueue === "all"}
            variant={activeQueue === "all" ? "filled" : "outlined"}
          />
          {participantTaskQueues.map((queue) => (
            <Chip
              key={queue.key}
              clickable
              color={activeQueue === queue.key ? "primary" : "default"}
              label={`${queue.label} (${queueCounts[queue.key]})`}
              onClick={() =>
                setActiveQueue((current) =>
                  current === queue.key ? "all" : queue.key,
                )
              }
              aria-pressed={activeQueue === queue.key}
              variant={activeQueue === queue.key ? "filled" : "outlined"}
            />
          ))}
        </Stack>
      </Paper>

      <TableContainer component={Paper} elevation={1}>
        <Table aria-label="Participants">
          <TableHead>
            <TableRow>
              <TableCell>Organization</TableCell>
              <TableCell>BPN</TableCell>
              <TableCell>Status</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {visibleRows.map(({ participant, task }) => (
              <TableRow
                key={participant.id}
                hover
                selected={participant.id === detailId}
              >
                <TableCell sx={{ minWidth: 220 }}>
                  <Button
                    color="inherit"
                    variant="text"
                    onClick={() => openDetails(participant.id)}
                    sx={{
                      display: "block",
                      fontWeight: 700,
                      minWidth: 0,
                      p: 0,
                      textAlign: "left",
                      textTransform: "none",
                    }}
                  >
                    {participant.organization.legalName}
                  </Button>
                  <Typography variant="caption" color="text.secondary">
                    {participant.organization.contactEmail || "-"}
                  </Typography>
                </TableCell>
                <TableCell>
                  <MonoText
                    value={
                      participant.bpn.assignedBpn ||
                      participant.bpn.requestedBpn ||
                      "-"
                    }
                  />
                  {participant.bpn.assignedBpn ? (
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ display: "block", mt: 0.25 }}
                    >
                      {participant.bpn.verificationStatus === "VERIFIED"
                        ? "Verified"
                        : participant.bpn.verificationStatus}
                    </Typography>
                  ) : null}
                </TableCell>
                <TableCell sx={{ minWidth: 260 }}>
                  <Stack spacing={0.75} sx={{ alignItems: "flex-start" }}>
                    <StatusChip label={task.tableCue} color={task.severity} />
                    <Typography variant="body2">{task.description}</Typography>
                  </Stack>
                </TableCell>
                <TableCell align="right" sx={{ minWidth: 170 }}>
                  <Stack spacing={1} sx={{ alignItems: "flex-end" }}>
                    {task.taskKind ? (
                      <Button
                        size="small"
                        variant="contained"
                        color={task.severity === "error" ? "error" : "primary"}
                        onClick={() => openTask(participant.id)}
                      >
                        {task.tableCue}
                      </Button>
                    ) : null}
                    <Button
                      size="small"
                      color="inherit"
                      onClick={() => openDetails(participant.id)}
                    >
                      View details
                    </Button>
                  </Stack>
                </TableCell>
              </TableRow>
            ))}
            {!visibleRows.length ? (
              <TableRow>
                <TableCell
                  colSpan={4}
                  align="center"
                  sx={{ height: 112, color: "text.secondary" }}
                >
                  No participants match this queue.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </TableContainer>

      <ParticipantDrawer
        open={Boolean(detailId)}
        participant={selectedParticipant}
        saving={detailSaving || selectedQuery.isFetching}
        tab={drawerTab}
        onClose={() => setDetailId("")}
        onSaveOrganization={async (id, body) => {
          await updateOrganizationMutation.mutateAsync({ id, body });
        }}
        onSaveTechnical={async (id, body) => {
          await updateTechnicalMutation.mutateAsync({ id, body });
        }}
        onTabChange={setDrawerTab}
      />

      {createOpen ? (
        <CreateParticipantDialog
          error={createMutation.error}
          open
          saving={createMutation.isPending}
          onClose={() => setCreateOpen(false)}
          onCreate={(body) => createMutation.mutate(body)}
        />
      ) : null}

      {lastInvite ? (
        <ParticipantInviteDialog
          invite={lastInvite}
          onClose={() => setLastInvite(null)}
        />
      ) : null}
    </Stack>
  );
}
