import { useState } from 'react'
import { Form, SaveButton, useTranslate } from 'react-admin'
import { useFormContext } from 'react-hook-form'
import { Box, Button, DialogActions, DialogContent, Step, StepLabel, Stepper } from '@mui/material'
import { styled } from '@mui/material/styles'
import { BasicInformationStep, DataAddressStep, OptionalFeaturesStep } from '../assets/shared/steps'

const LAST_STEP = 2

const fieldsForStep = (step: number, dataAddressType?: string) => {
  if (step === 0) return ['title', 'abstract']
  if (step !== 1) return []
  if (dataAddressType === 'AmazonS3' || dataAddressType === 's3') {
    return ['dataAddress.type', 'dataAddress.region', 'dataAddress.bucketName']
  }
  return ['dataAddress.type', 'dataAddress.baseUrl']
}

const DialogForm = styled(Form)({
  display: 'flex',
  flex: '1 1 auto',
  flexDirection: 'column',
  minHeight: 0,
})

const WizardActions = ({
  activeStep,
  setActiveStep,
  saveLabel,
  onCancel,
}: {
  activeStep: number
  setActiveStep: (step: number) => void
  saveLabel: string
  onCancel?: () => void
}) => {
  const translate = useTranslate()
  const { getValues, trigger } = useFormContext()

  const next = async () => {
    const values = getValues()
    const fields = fieldsForStep(activeStep, values?.dataAddress?.type)
    if (await trigger(fields)) setActiveStep(activeStep + 1)
  }

  return (
    <>
      <Box sx={{ flex: '1 1 auto' }}>
        {activeStep > 0 ? (
          <Button onClick={() => setActiveStep(activeStep - 1)}>{translate('portalUx.common.back')}</Button>
        ) : onCancel ? (
          <Button onClick={onCancel}>{translate('portalUx.common.cancel')}</Button>
        ) : null}
      </Box>
      {activeStep < LAST_STEP ? (
        <Button variant="contained" onClick={next}>
          {translate('portalUx.common.next')}
        </Button>
      ) : (
        <SaveButton alwaysEnable label={saveLabel} />
      )}
    </>
  )
}

export const DataProductWizardForm = ({
  defaultValues,
  saveLabel,
  onCancel,
}: {
  defaultValues?: Record<string, unknown>
  saveLabel: string
  onCancel?: () => void
}) => {
  const translate = useTranslate()
  const [activeStep, setActiveStep] = useState(0)
  const steps = [
    translate('portalUx.productCreate.details'),
    translate('portalUx.productCreate.dataSource'),
    translate('resources.assets.create.steps.optionalFeatures'),
  ]

  return (
    <DialogForm defaultValues={defaultValues}>
      <DialogContent dividers sx={{ flex: '1 1 auto', minHeight: 0, overflowY: 'auto', p: 0 }}>
        <Box sx={{ width: '100%', maxWidth: 1000, mx: 'auto', px: { xs: 2, sm: 4 }, py: 3 }}>
          <Box sx={{ width: '100%', mb: 4 }}>
            <Stepper activeStep={activeStep} alternativeLabel>
              {steps.map((label) => (
                <Step key={label}>
                  <StepLabel>{label}</StepLabel>
                </Step>
              ))}
            </Stepper>
          </Box>
          <Box sx={{ width: '100%', px: { xs: 0, sm: 2 } }}>
            {activeStep === 0 && <BasicInformationStep />}
            {activeStep === 1 && <DataAddressStep />}
            {activeStep === 2 && <OptionalFeaturesStep />}
          </Box>
        </Box>
      </DialogContent>
      <DialogActions sx={{ flex: '0 0 auto', gap: 2, px: 3, py: 2 }}>
        <WizardActions
          activeStep={activeStep}
          setActiveStep={setActiveStep}
          saveLabel={saveLabel}
          onCancel={onCancel}
        />
      </DialogActions>
    </DialogForm>
  )
}
