import { useState } from "react";
import CloseIcon from "@mui/icons-material/Close";
import {
  Box,
  Drawer,
  IconButton,
  Stack,
  Tab,
  Tabs,
  Tooltip,
  Typography,
} from "@mui/material";
import { canEditConnectorMetadata } from "../participant-tasks";
import type {
  Participant,
  ParticipantOrganizationUpdate,
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

export type DrawerTab = 0 | 1 | 2 | 3 | 4;
type EditDialog = "organization" | "connector" | null;

export function ParticipantDrawer({
  open,
  participant,
  saving,
  tab,
  onClose,
  onSaveOrganization,
  onSaveTechnical,
  onTabChange,
}: {
  open: boolean;
  participant: Participant | null;
  saving: boolean;
  tab: DrawerTab;
  onClose: () => void;
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
            <Tooltip title="Close">
              <IconButton
                aria-label="Close participant drawer"
                onClick={closeDrawer}
              >
                <CloseIcon />
              </IconButton>
            </Tooltip>
          </Stack>
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
            {tab === 4 ? <AuditTab participant={participant} /> : null}
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
