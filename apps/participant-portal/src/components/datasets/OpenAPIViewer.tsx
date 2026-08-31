import { useEffect, useState } from 'react'
import { useRecordContext, useTranslate } from 'react-admin'
import { Typography, Box, CircularProgress, useTheme } from '@mui/material'
import SwaggerUI from 'swagger-ui-react'
import 'swagger-ui-react/swagger-ui.css'
import { isRequestWithinEndpoint } from '../../utils/apiDescriptionUtils'

interface OpenAPIViewerProps {
  authToken?: string
  endpoint?: string
}

export const OpenAPIViewer = ({ authToken, endpoint }: OpenAPIViewerProps) => {
  const record = useRecordContext()
  const translate = useTranslate()
  const theme = useTheme()
  const apiDescription = record?.apiDescription
  const [openApiSpec, setOpenApiSpec] = useState<unknown>()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>()
  const isDarkMode = theme.palette.mode === 'dark'

  useEffect(() => {
    if (!apiDescription || !endpoint) {
      setOpenApiSpec(undefined)
      setError(undefined)
      return
    }

    const controller = new AbortController()
    setLoading(true)
    setError(undefined)
    fetch('/api/portal/api-description/openapi', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ apiDescription, endpoint }),
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = await response.json()
        if (!response.ok) throw new Error(body.message || `HTTP ${response.status}`)
        setOpenApiSpec(body.data)
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === 'AbortError') return
        setError(reason instanceof Error ? reason.message : String(reason))
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [apiDescription, endpoint])

  if (!apiDescription || !endpoint) {
    return (
      <Typography variant="body2" color="text.secondary">
        {translate('resources.assets.tabs.apiDescriptionTab.noDescription')}
      </Typography>
    )
  }

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
        <CircularProgress />
      </Box>
    )
  }

  if (error) {
    return (
      <Typography variant="body2" color="error">
        {translate('resources.datasets.openapi.conversionError')}: {error}
      </Typography>
    )
  }

  if (!openApiSpec) return null

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {translate('portalUx.myData.openapiDescription')}
      </Typography>
      <Box
        sx={{
          '& .swagger-ui': {
            fontFamily: 'inherit',
            ...(isDarkMode && {
              filter: 'invert(88%) hue-rotate(180deg)',
              '& .microlight': { filter: 'invert(100%) hue-rotate(180deg)' },
              '& img, & svg': { filter: 'invert(100%) hue-rotate(180deg)' },
            }),
          },
        }}
      >
        <SwaggerUI
          spec={openApiSpec}
          requestInterceptor={(request) => {
            if (!isRequestWithinEndpoint(request.url, endpoint)) {
              throw new Error('OpenAPI request outside the negotiated endpoint was blocked')
            }

            request.credentials = 'omit'
            request.redirect = 'error'
            if (authToken) {
              request.headers.Authorization = authToken
            } else {
              delete request.headers.Authorization
              delete request.headers.authorization
            }
            return request
          }}
        />
      </Box>
    </Box>
  )
}
