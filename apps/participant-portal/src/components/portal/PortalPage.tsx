import type { ReactNode } from 'react'
import { Title, TopToolbar } from 'react-admin'
import { Alert, Box, Button, Chip, CircularProgress, Typography } from '@mui/material'
import InboxOutlinedIcon from '@mui/icons-material/InboxOutlined'

export const PageHeader = ({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) => (
  <>
    <Title title={title} />
    <Box
      component="header"
      sx={{
        display: 'flex',
        flexDirection: { xs: 'column', sm: 'row' },
        justifyContent: 'space-between',
        alignItems: { sm: 'flex-start' },
        gap: 2,
        mb: 3,
      }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="h4" component="h1" sx={{ overflowWrap: 'anywhere' }}>
          {title}
        </Typography>
        {subtitle && (
          <Typography color="text.secondary" sx={{ mt: 0.5, maxWidth: 760 }}>
            {subtitle}
          </Typography>
        )}
      </Box>
      {actions && (
        <TopToolbar
          sx={{
            p: 0,
            minHeight: 40,
            gap: 1,
            flexWrap: 'wrap',
            justifyContent: { xs: 'flex-start', sm: 'flex-end' },
          }}
        >
          {actions}
        </TopToolbar>
      )}
    </Box>
  </>
)

export const EmptyState = ({ title, text, action }: { title: string; text: string; action?: ReactNode }) => (
  <Box
    sx={{
      border: 1,
      borderColor: 'divider',
      p: { xs: 3, sm: 5 },
      bgcolor: 'background.paper',
      textAlign: 'center',
    }}
  >
    <InboxOutlinedIcon color="disabled" sx={{ fontSize: 48, mb: 1 }} aria-hidden />
    <Typography variant="h6" component="h2">
      {title}
    </Typography>
    <Typography color="text.secondary" sx={{ mt: 1, mx: 'auto', maxWidth: 560 }}>
      {text}
    </Typography>
    {action && <Box sx={{ mt: 2 }}>{action}</Box>}
  </Box>
)

export const LoadingState = () => (
  <Box role="status" aria-live="polite" sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
    <CircularProgress />
  </Box>
)

export const ResourceError = ({
  message,
  retryLabel,
  onRetry,
}: {
  message: string
  retryLabel: string
  onRetry: () => void
}) => (
  <Alert
    severity="error"
    action={
      <Button color="inherit" size="small" onClick={onRetry}>
        {retryLabel}
      </Button>
    }
  >
    {message}
  </Alert>
)

export const FriendlyStatusChip = ({ status, label }: { status: string; label: string }) => {
  const color =
    status === 'granted' || status === 'published'
      ? 'primary'
      : status === 'rejected' || status === 'failed'
        ? 'error'
        : status === 'ended' || status === 'unknown' || status === 'private'
          ? 'default'
          : 'warning'
  return <Chip size="small" color={color} variant={color === 'default' ? 'outlined' : 'filled'} label={label} />
}
