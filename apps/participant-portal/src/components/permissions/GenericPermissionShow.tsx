import { Box, Card, CardContent, Chip, Typography } from "@mui/material";
import { Policy as PolicyIcon } from "@mui/icons-material";
import { useTranslate } from "react-admin";

import { getTractusXConstraint } from "../../pages/policies/shared/tractusxPolicyMetadata";
import { InfoItem, InfoRow } from "./PermissionLayout";

type PermissionProps = {
  permission: any;
};

const KNOWN_NAMESPACES = [
  "https://w3id.org/catenax/2025/9/policy/",
  "https://w3id.org/catenax/policy/",
  "http://www.w3.org/ns/odrl/2/",
  "https://www.w3.org/ns/odrl/2/",
];

const KNOWN_PREFIXES = ["cx-policy:", "catenax:", "odrl:"];

const compactTerm = (value: unknown) => {
  if (typeof value !== "string") return value;

  const namespace = KNOWN_NAMESPACES.find((ns) => value.startsWith(ns));
  if (namespace) return value.slice(namespace.length);

  const prefix = KNOWN_PREFIXES.find((candidate) =>
    value.startsWith(candidate)
  );
  if (prefix) return value.slice(prefix.length);

  return value;
};

const formatValue = (value: unknown): string => {
  if (Array.isArray(value)) return value.map(formatValue).join(", ");
  if (value instanceof Date) return value.toISOString();

  const compacted = compactTerm(value);
  return compacted === undefined || compacted === null ? "" : String(compacted);
};

const formatConstraintName = (value: unknown) => {
  const compacted = compactTerm(value);
  if (typeof compacted !== "string") return formatValue(compacted);

  return getTractusXConstraint(compacted)?.label || compacted;
};

const wrapTextSx = {
  mt: 0.25,
  overflowWrap: "anywhere",
  wordBreak: "break-word",
};

export const GenericPermissionShow = ({ permission }: PermissionProps) => {
  const translate = useTranslate();

  return (
    <Card variant="outlined" sx={{ mb: 1 }}>
      <CardContent sx={{ py: 1 }}>
        <Box sx={{ display: "flex", alignItems: "center", mb: 1 }}>
          <PolicyIcon color="primary" sx={{ mr: 1 }} />
          <Typography variant="subtitle2" sx={{ fontWeight: "medium" }}>
            {translate(
              "resources.policies.create.permissions.tractusxPermission"
            )}
          </Typography>
        </Box>

        <InfoRow>
          <InfoItem label={translate("resources.policies.show.action")}>
            <Chip
              label={formatValue(permission.action || "use")}
              color="success"
              variant="outlined"
              size="small"
            />
          </InfoItem>
        </InfoRow>

        {permission.constraints && permission.constraints.length > 0 && (
          <Box sx={{ mt: 1 }}>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: "block" }}
            >
              {translate("resources.policies.show.constraints")}
            </Typography>
            {permission.constraints.map((constraint: any, index: number) => (
              <Box
                key={index}
                sx={{
                  p: 1,
                  bgcolor: "grey.50",
                  borderRadius: 1,
                  mb: 0.5,
                  mt: 0.5,
                }}
              >
                <InfoRow>
                  <InfoItem
                    label={translate("resources.policies.show.leftOperand")}
                  >
                    <Typography variant="body2" sx={wrapTextSx}>
                      {formatConstraintName(constraint.leftOperand)}
                    </Typography>
                  </InfoItem>
                  <InfoItem
                    label={translate("resources.policies.show.operator")}
                  >
                    <Typography variant="body2" sx={wrapTextSx}>
                      {formatValue(constraint.operator)}
                    </Typography>
                  </InfoItem>
                  <InfoItem
                    label={translate("resources.policies.show.rightOperand")}
                  >
                    <Typography variant="body2" sx={wrapTextSx}>
                      {formatValue(constraint.rightOperand)}
                    </Typography>
                  </InfoItem>
                </InfoRow>
              </Box>
            ))}
          </Box>
        )}
      </CardContent>
    </Card>
  );
};
