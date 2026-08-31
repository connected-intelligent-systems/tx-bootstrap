import { useMemo, useState } from 'react'
import { useRecordContext, useTranslate } from 'react-admin'
import { Alert, Box, Button, Chip, Divider, Paper, Stack, Typography } from '@mui/material'
import type { ChipProps } from '@mui/material'
import DownloadIcon from '@mui/icons-material/Download'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import type { OpenApiDocument } from '../../types/asset'
import {
  apiDescriptionDownloadName,
  summarizeApiDescription,
  type OpenApiOperationSummary,
} from '../../utils/apiDescriptionSummary'

const SUMMARY_LIMIT = 10

export const ApiDescription = () => {
  const record = useRecordContext()
  const translate = useTranslate()
  const [showAllOperations, setShowAllOperations] = useState(false)
  const apiDescription = record?.apiDescription as OpenApiDocument | undefined
  const summary = useMemo(
    () => (apiDescription ? summarizeApiDescription(apiDescription) : undefined),
    [apiDescription],
  )

  if (!apiDescription || !summary) {
    return (
      <Typography variant="body2" color="text.secondary">
        {translate('resources.assets.tabs.apiDescriptionTab.noDescription')}
      </Typography>
    )
  }

  const technicalDocument = JSON.stringify(apiDescription, null, 2)
  const visibleOperations = showAllOperations ? summary.operations : summary.operations.slice(0, SUMMARY_LIMIT)
  const formatLabel = ['OpenAPI', summary.specificationVersion].filter(Boolean).join(' ')

  const downloadDocument = () => {
    const blob = new Blob([technicalDocument], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = apiDescriptionDownloadName(summary.title)
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  return (
    <Stack spacing={3}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ justifyContent: 'space-between' }}>
        <Box>
          <Typography variant="h6" component="h3">
            {summary.title || translate('resources.assets.tabs.apiDescriptionTab.untitled')}
          </Typography>
          {summary.description && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {summary.description}
            </Typography>
          )}
        </Box>
        <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <Chip label={formatLabel} color="primary" variant="outlined" />
          {summary.version && (
            <Chip
              label={`${translate('resources.assets.tabs.apiDescriptionTab.version')}: ${summary.version}`}
              variant="outlined"
            />
          )}
        </Stack>
      </Stack>

      <Alert severity="info">
        <Typography variant="subtitle2">
          {translate('resources.assets.tabs.apiDescriptionTab.endpointNeutralTitle')}
        </Typography>
        <Typography variant="body2">
          {translate('resources.assets.tabs.apiDescriptionTab.endpointNeutralDescription')}
        </Typography>
      </Alert>

      <Box component="section">
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1.5 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            {translate('resources.assets.tabs.apiDescriptionTab.operations')}
          </Typography>
          <Chip size="small" label={summary.operations.length} />
        </Stack>

        {visibleOperations.length > 0 ? (
          <Paper variant="outlined">
            <Stack divider={<Divider flexItem />}>
              {visibleOperations.map((operation) => (
                <OperationRow
                  key={`${operation.method}:${operation.path}`}
                  operation={operation}
                  translate={translate}
                />
              ))}
            </Stack>
          </Paper>
        ) : (
          <Typography variant="body2" color="text.secondary">
            {translate('resources.assets.tabs.apiDescriptionTab.noOperations')}
          </Typography>
        )}

        {summary.operations.length > SUMMARY_LIMIT && (
          <Button
            size="small"
            sx={{ mt: 1 }}
            endIcon={showAllOperations ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            onClick={() => setShowAllOperations((visible) => !visible)}
          >
            {translate(
              showAllOperations
                ? 'resources.assets.tabs.apiDescriptionTab.showLess'
                : 'resources.assets.tabs.apiDescriptionTab.showAll',
            )}
          </Button>
        )}
      </Box>

      <Divider />
      <Box>
        <Button size="small" variant="outlined" startIcon={<DownloadIcon />} onClick={downloadDocument}>
          {translate('resources.assets.tabs.apiDescriptionTab.downloadDocument')}
        </Button>
      </Box>
    </Stack>
  )
}

const OperationRow = ({
  operation,
  translate,
}: {
  operation: OpenApiOperationSummary
  translate: ReturnType<typeof useTranslate>
}) => (
  <Box
    sx={{
      display: 'grid',
      gridTemplateColumns: { xs: '58px minmax(0, 1fr)', sm: '64px minmax(140px, 0.8fr) minmax(150px, 1fr) auto' },
      columnGap: 1,
      rowGap: 0.25,
      alignItems: 'center',
      px: 1.25,
      py: 0.75,
    }}
  >
    <Chip
      size="small"
      label={operation.method}
      color={methodColor(operation.method)}
      sx={{ minWidth: 58, height: 22, gridColumn: 1 }}
    />
    <Typography
      variant="body2"
      component="code"
      sx={{ fontFamily: 'monospace', overflowWrap: 'anywhere', gridColumn: 2 }}
    >
      {operation.path}
    </Typography>
    <Typography variant="body2" color="text.secondary" sx={{ gridColumn: { xs: 2, sm: 3 }, minWidth: 0 }}>
      {operation.label || operation.description || '—'}
    </Typography>
    <Typography
      variant="caption"
      color="text.secondary"
      sx={{ gridColumn: { xs: 2, sm: 4 }, whiteSpace: { sm: 'nowrap' } }}
    >
      {operation.responseMediaTypes.length > 0
        ? `${translate('resources.assets.tabs.apiDescriptionTab.responseFormats')}: ${operation.responseMediaTypes.join(', ')}`
        : ''}
    </Typography>
  </Box>
)

function methodColor(method: string): ChipProps['color'] {
  switch (method) {
    case 'GET':
      return 'success'
    case 'POST':
      return 'primary'
    case 'PUT':
      return 'warning'
    case 'PATCH':
      return 'secondary'
    case 'DELETE':
      return 'error'
    default:
      return 'default'
  }
}
