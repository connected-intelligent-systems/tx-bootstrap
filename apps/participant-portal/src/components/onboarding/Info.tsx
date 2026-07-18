import { Box, Typography } from '@mui/material'
import type { ReactNode } from 'react'

export function InfoGrid(props: { children: ReactNode }) {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 1.4 }}>
      {props.children}
    </Box>
  )
}

export function Info(props: { label: string; value: string; mono?: boolean }) {
  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 650 }}>
        {props.label}
      </Typography>
      <Typography sx={{ fontWeight: 800, overflowWrap: 'anywhere', fontFamily: props.mono ? 'monospace' : undefined }}>
        {props.value || '-'}
      </Typography>
    </Box>
  )
}
