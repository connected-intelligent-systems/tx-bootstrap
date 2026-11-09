import { useState } from "react";
import BlockIcon from "@mui/icons-material/Block";
import CloseIcon from "@mui/icons-material/Close";
import {
  Box,
  Button,
  Drawer,
  IconButton,
  Stack,
  Tab,
  Tabs,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  canEditConnectorMetadata,
  canRevokeParticipant,
} from "../participant-tasks";
import type {
  Participant,
  ParticipantOrganizationUpdate,
  RevokeInput,
  TechnicalMetadataUpdate,
} from "../types";
import {
  AuditTab,
  BpnTab,
  ConnectorTab,
  CredentialsTab,
  OrganizationTab,
} from "./participant-detail-tabs";
import {
  ConnectorMetadataEditDialog,
  OrganizationEditDialog,
} from "./participant-edit-dialogs";
import { TunnelTab } from "./participant-tunnel";
import {
  ParticipantAccessDialog,
  RevocationBanner,
} from "./participant-revocation";

export type DrawerTab = 0 | 1 | 2 | 3 | 4 | 5;
type EditDialog = "organization" | "connector" | "revoke" | "readmit" | null;

export function ParticipantDrawer({
  open,
  participant,
  saving,
  tab,
  revoking,
  onClose,
  onReadmit,
  onRevoke,
  onSaveOrganization,
  onSaveTechnical,
  onTabChange,
}: {
  open: boolean;
  participant: Participant | null;
  saving: boolean;
  tab: DrawerTab;
  revoking: boolean;
  onClose: () => void;
  onRevoke: (id: string, body: RevokeInput) => Promise<unknown>;
  onReadmit: (id: string, body: RevokeInput) => Promise<unknown>;
  onSaveOrganization: (
    id: string,
    body: ParticipantOrganizationUpdate,
  ) => Promise<void>;
  onSaveTechnical: (id: string, body: TechnicalMetadataUpdate) => Promise<void>;
  onTabChange: (tab: DrawerTab) => void;
}) {
  const [editDialog, setEditDialog] = useState<EditDialog>(null);

  function closeDrawer() {
    setEditDialog(null);
    onClose();
  }

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={closeDrawer}
      slotProps={{
        paper: { sx: { width: { xs: "100%", md: 840 }, maxWidth: "100%" } },
      }}
    >
      {!participant ? (
        <Box sx={{ p: 2 }}>
          <Typography>Loading participant...</Typography>
        </Box>
      ) : (
        <Stack sx={{ minHeight: "100%" }}>
          <Stack
            direction="row"
            spacing={1.5}
            sx={{ alignItems: "flex-start", p: 2, pb: 1 }}
          >
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography
                variant="h6"
                sx={{ fontWeight: 850, overflowWrap: "anywhere" }}
              >
                {participant.organization.legalName}
              </Typography>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ fontFamily: "monospace", overflowWrap: "anywhere" }}
              >
                {participant.id}
              </Typography>
            </Box>
            {canRevokeParticipant(participant) ? (
              <Button
                color="error"
                variant="outlined"
                size="small"
                startIcon={<BlockIcon />}
                onClick={() => setEditDialog("revoke")}
                sx={{ flexShrink: 0, mt: 0.5 }}
              >
                Revoke
              </Button>
            ) : null}
            <Tooltip title="Close">
              <IconButton
                aria-label="Close participant drawer"
                onClick={closeDrawer}
              >
                <CloseIcon />
              </IconButton>
            </Tooltip>
          </Stack>
          {participant.revocation ? (
            <Box sx={{ px: 2, pb: 1 }}>
              <RevocationBanner
                participant={participant}
                retrying={revoking}
                onReadmit={() => setEditDialog("readmit")}
                onRetry={() =>
                  void onRevoke(participant.id, {
                    reason: participant.revocation?.reason || "Retry",
                    confirmBpn: participant.bpn.assignedBpn,
                  }).catch(() => undefined)
                }
              />
            </Box>
          ) : null}
          <Tabs
            value={tab}
            onChange={(_, value: DrawerTab) => onTabChange(value)}
            variant="scrollable"
            scrollButtons="auto"
            aria-label="Participant details tabs"
            sx={{ borderBottom: 1, borderColor: "divider", px: 1 }}
          >
            <Tab label="Organization" />
            <Tab label="BPN" />
            <Tab label="Connector" />
            <Tab label="Credentials" />
            <Tab label="Tunnel" />
            <Tab label="Audit" />
          </Tabs>
          <Box sx={{ p: 2, overflow: "auto", flex: 1 }}>
            {tab === 0 ? (
              <OrganizationTab
                participant={participant}
                onEdit={() => setEditDialog("organization")}
              />
            ) : null}
            {tab === 1 ? <BpnTab participant={participant} /> : null}
            {tab === 2 ? (
              <ConnectorTab
                canEdit={canEditConnectorMetadata(participant)}
                participant={participant}
                onEdit={() => setEditDialog("connector")}
              />
            ) : null}
            {tab === 3 ? <CredentialsTab participant={participant} /> : null}
            {tab === 4 ? (
              <TunnelTab key={participant.id} participant={participant} />
            ) : null}
            {tab === 5 ? <AuditTab participant={participant} /> : null}
          </Box>

          {editDialog === "organization" ? (
            <OrganizationEditDialog
              key={`${participant.id}-organization-editor`}
              participant={participant}
              saving={saving}
              onClose={() => setEditDialog(null)}
              onSave={(body) => onSaveOrganization(participant.id, body)}
            />
          ) : null}
          {editDialog === "revoke" || editDialog === "readmit" ? (
            <ParticipantAccessDialog
              key={`${participant.id}-${editDialog}`}
              mode={editDialog}
              participant={participant}
              onClose={() => setEditDialog(null)}
              onConfirm={(body) =>
                editDialog === "revoke"
                  ? onRevoke(participant.id, body)
                  : onReadmit(participant.id, body)
              }
            />
          ) : null}
          {editDialog === "connector" ? (
            <ConnectorMetadataEditDialog
              key={`${participant.id}-connector-editor`}
              participant={participant}
              saving={saving}
              onClose={() => setEditDialog(null)}
              onSave={(body) => onSaveTechnical(participant.id, body)}
            />
          ) : null}
        </Stack>
      )}
    </Drawer>
  );
}
