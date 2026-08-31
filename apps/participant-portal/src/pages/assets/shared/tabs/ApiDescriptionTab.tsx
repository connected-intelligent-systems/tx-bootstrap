import { useState } from 'react'
import type React from 'react'
import { Typography, Button, Box, Alert, Accordion, AccordionSummary, AccordionDetails, useTheme } from '@mui/material'
import { useTranslate, useInput } from 'react-admin'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import CodeMirror from '@uiw/react-codemirror'
import { json } from '@codemirror/lang-json'
import { EditorState } from '@codemirror/state'
import { githubLight, githubDark } from '@uiw/codemirror-theme-github'
import { parse } from 'yaml'
import { parseOpenApiDocument, type OpenApiDescriptionValidation } from '../../../../utils/apiDescriptionUtils'

export const ApiDescriptionTab = () => {
  const translate = useTranslate()
  const theme = useTheme()
  const { field } = useInput({ source: 'apiDescription' })
  const [error, setError] = useState<string | null>(null)
  const [validationErrors, setValidationErrors] = useState<NonNullable<OpenApiDescriptionValidation['errors']>>([])

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    event.target.value = ''

    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string
        const parsedDocument = parseOpenApiFile(content)

        setError(null)
        setValidationErrors([])

        const validationResult = parseOpenApiDocument(parsedDocument)

        if (!validationResult.valid) {
          setValidationErrors(validationResult.errors || [])
          setError(translate('resources.assets.create.apiDescription.errors.validationFailed'))
          return
        }

        field.onChange(validationResult.value)
        setError(null)
        setValidationErrors([])
      } catch (_err) {
        setError(translate('resources.assets.create.apiDescription.errors.invalidDocument'))
      }
    }
    reader.readAsText(file)
  }

  return (
    <>
      <Typography variant="h6" gutterBottom>
        {translate('resources.assets.create.apiDescription.title')}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {translate('resources.assets.create.apiDescription.description')}
      </Typography>

      <Box sx={{ mb: 2 }}>
        <Button variant="outlined" component="label" startIcon={<UploadFileIcon />}>
          {translate('resources.assets.create.apiDescription.uploadButton')}
          <input
            type="file"
            hidden
            accept=".json,.yaml,.yml,application/json,application/yaml,text/yaml"
            onChange={handleFileUpload}
          />
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
          {validationErrors.length > 0 && (
            <Box sx={{ mt: 1 }}>
              <Typography variant="caption" component="div" sx={{ mb: 1 }}>
                {translate('resources.assets.create.apiDescription.errors.details')}
              </Typography>
              <Box
                component="pre"
                sx={{
                  fontSize: '0.75rem',
                  overflow: 'auto',
                  maxHeight: '200px',
                }}
              >
                {JSON.stringify(validationErrors, null, 2)}
              </Box>
            </Box>
          )}
        </Alert>
      )}

      {field.value && (
        <Accordion>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography>{translate('resources.assets.create.apiDescription.viewDescription')}</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <CodeMirror
              value={JSON.stringify(field.value, null, 2)}
              extensions={[json(), EditorState.readOnly.of(true)]}
              theme={theme.palette.mode === 'dark' ? githubDark : githubLight}
              basicSetup={{
                lineNumbers: true,
                foldGutter: true,
              }}
            />
          </AccordionDetails>
        </Accordion>
      )}
    </>
  )
}

function parseOpenApiFile(content: string): unknown {
  try {
    return JSON.parse(content)
  } catch {
    return parse(content)
  }
}
