import { Box, Card, CardContent, Typography } from "@mui/material";

export interface DashboardStatsCounts {
  total: number;
  needsAdminAction: number;
  inProgress: number;
  active: number;
}

export function DashboardStats({ counts }: { counts: DashboardStatsCounts }) {
  return (
    <Box
      sx={{
        display: "grid",
        gap: 2,
        gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", md: "repeat(4, 1fr)" },
        mb: 3,
      }}
    >
      <StatCard title="Total Participants" value={counts.total} />
      <StatCard title="Needs Admin Action" value={counts.needsAdminAction} />
      <StatCard title="In Progress" value={counts.inProgress} />
      <StatCard title="Active" value={counts.active} />
    </Box>
  );
}

function StatCard({ title, value }: { title: string; value: number }) {
  return (
    <Card variant="outlined" sx={{ height: "100%" }}>
      <CardContent>
        <Typography component="h2" variant="subtitle2" gutterBottom>
          {title}
        </Typography>
        <Typography variant="h3" component="p">
          {value}
        </Typography>
      </CardContent>
    </Card>
  );
}
