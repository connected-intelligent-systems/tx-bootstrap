import { FormDataConsumer, SelectInput, TextInput, required, useTranslate } from 'react-admin'
import { useEffect, useState } from 'react'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import { Accordion, AccordionSummary, AccordionDetails, Typography } from '@mui/material'
import { useFormContext, useWatch } from 'react-hook-form'

const TransferTypeHandler = () => {
  const transferType = useWatch({ name: 'transferType' })
  const formContext = useFormContext()

  useEffect(() => {
    switch (transferType) {
      case 'HttpData-PULL':
        formContext.setValue('dataDestination.type', 'HttpData')
        break
      case 'HttpData-PUSH':
        formContext.setValue('dataDestination.type', 'HttpData')
        break
      case 'AmazonS3-PUSH':
        formContext.setValue('dataDestination.type', 'AmazonS3')
        break
      case 'AzureStorage-PUSH':
        formContext.setValue('dataDestination.type', 'AzureStorage')
        break
      default:
        break
    }
  }, [transferType, formContext])

  return null
}

const HttpDataPush = () => {
  const translate = useTranslate()
  return (
    <>
      <TextInput
        source="dataDestination.baseUrl"
        label={translate('resources.transferprocesses.fields.baseUrl')}
        helperText={translate('resources.transferprocesses.create.fields.baseUrlHelper')}
        validate={[required()]}
        fullWidth
      />
      <SelectInput
        source="dataDestination.method"
        label={translate('resources.transferprocesses.fields.method')}
        choices={['POST', 'PUT', 'PATCH'].map((id) => ({ id, name: id }))}
        defaultValue="POST"
        fullWidth
      />
      <TextInput
        source="dataDestination.path"
        label={translate('resources.transferprocesses.fields.path')}
        helperText={translate('resources.transferprocesses.create.fields.pathHelper')}
        fullWidth
      />
      <TextInput
        source="dataDestination.contentType"
        label={translate('resources.transferprocesses.fields.contentType')}
        defaultValue="application/json"
        fullWidth
      />
      <TextInput
        source="dataDestination.authKey"
        label={translate('resources.transferprocesses.fields.authKey')}
        helperText={translate('resources.transferprocesses.create.fields.authKeyHelper')}
        fullWidth
      />
      <TextInput
        source="dataDestination.authCode"
        label={translate('resources.transferprocesses.fields.authCode')}
        type="password"
        helperText={translate('resources.transferprocesses.create.fields.authCodeHelper')}
        fullWidth
      />
    </>
  )
}

const AmazonS3Push = () => {
  const translate = useTranslate()
  return (
    <>
      <TextInput
        source="dataDestination.region"
        label={translate('resources.transferprocesses.fields.region')}
        helperText={translate('resources.transferprocesses.create.fields.regionHelper')}
        validate={[required()]}
        fullWidth
      />
      <TextInput
        source="dataDestination.endpointOverride"
        label={translate('resources.transferprocesses.fields.endpointOverride')}
        helperText={translate('resources.transferprocesses.create.fields.endpointOverrideHelper')}
        fullWidth
      />
      <TextInput
        source="dataDestination.bucketName"
        label={translate('resources.transferprocesses.fields.bucketName')}
        helperText={translate('resources.transferprocesses.create.fields.bucketNameHelper')}
        validate={[required()]}
        fullWidth
      />
      <TextInput
        source="dataDestination.keyName"
        label={translate('resources.transferprocesses.fields.keyName')}
        helperText={translate('resources.transferprocesses.create.fields.keyNameHelper')}
        validate={[required()]}
        fullWidth
      />
      <TextInput
        source="dataDestination.accessKeyId"
        label={translate('resources.transferprocesses.fields.accessKeyId')}
        helperText={translate('resources.transferprocesses.create.fields.accessKeyIdHelper')}
        validate={[required()]}
        fullWidth
      />
      <TextInput
        source="dataDestination.secretAccessKey"
        label={translate('resources.transferprocesses.fields.secretAccessKey')}
        helperText={translate('resources.transferprocesses.create.fields.secretAccessKeyHelper')}
        validate={[required()]}
        fullWidth
      />
    </>
  )
}

const AzureStoragePush = () => {
  const translate = useTranslate()
  return (
    <>
      <TextInput
        source="dataDestination.account"
        label={translate('resources.transferprocesses.fields.account')}
        validate={[required()]}
        fullWidth
      />
      <TextInput
        source="dataDestination.container"
        label={translate('resources.transferprocesses.fields.container')}
        validate={[required()]}
        fullWidth
      />
      <TextInput
        source="dataDestination.blobName"
        label={translate('resources.transferprocesses.fields.blobName')}
        validate={[required()]}
        fullWidth
      />
      <TextInput
        source="dataDestination.sharedKey"
        label={translate('resources.transferprocesses.fields.sharedKey')}
        type="password"
        helperText={translate('resources.transferprocesses.create.fields.sharedKeyHelper')}
        validate={[required()]}
        fullWidth
      />
    </>
  )
}

interface TransferProcessFormFieldsProps {
  lockCoreFields?: boolean
  hideCoreFields?: boolean
}

export const TransferProcessFormFields = ({
  lockCoreFields = false,
  hideCoreFields = false,
}: TransferProcessFormFieldsProps) => {
  const translate = useTranslate()
  const [showCoreFields, setShowCoreFields] = useState(!hideCoreFields)
  const toggleLabel = showCoreFields
    ? translate('resources.transferprocesses.actions.hideCoreFields', {
        _: 'Hide transfer details',
      })
    : translate('resources.transferprocesses.actions.showCoreFields', {
        _: 'Show transfer details',
      })

  const coreFields = (
    <>
      <TextInput
        label={translate('resources.transferprocesses.fields.counterPartyAddress')}
        source="counterPartyAddress"
        helperText={translate('resources.transferprocesses.create.fields.counterPartyAddressHelper')}
        fullWidth
        readOnly={lockCoreFields}
      />
      <TextInput
        label={translate('resources.transferprocesses.fields.contractId')}
        source="contractId"
        helperText={translate('resources.transferprocesses.create.fields.contractIdHelper')}
        fullWidth
        readOnly={lockCoreFields}
      />
      <TextInput
        label={translate('resources.transferprocesses.fields.assetId')}
        source="assetId"
        helperText={translate('resources.transferprocesses.create.fields.assetIdHelper')}
        fullWidth
        readOnly={lockCoreFields}
      />
      <TextInput
        label={translate('resources.transferprocesses.fields.protocol')}
        source="protocol"
        defaultValue="dataspace-protocol-http"
        helperText={translate('resources.transferprocesses.create.fields.protocolHelper')}
        fullWidth
        readOnly={lockCoreFields}
      />
    </>
  )

  return (
    <>
      {hideCoreFields ? (
        <Accordion
          disableGutters
          elevation={0}
          expanded={showCoreFields}
          onChange={(_, expanded) => setShowCoreFields(expanded)}
          sx={{
            border: (theme) => `1px solid ${theme.palette.divider}`,
            borderRadius: 1,
          }}
        >
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="subtitle2">{toggleLabel}</Typography>
          </AccordionSummary>
          <AccordionDetails>{coreFields}</AccordionDetails>
        </Accordion>
      ) : (
        coreFields
      )}
      <SelectInput
        source="transferType"
        label={translate('resources.transferprocesses.fields.transferType')}
        validate={[required()]}
        choices={[
          { id: 'HttpData-PULL', name: translate('resources.transferprocesses.create.types.httpPull') },
          { id: 'HttpData-PUSH', name: translate('resources.transferprocesses.create.types.httpPush') },
          { id: 'AmazonS3-PUSH', name: translate('resources.transferprocesses.create.types.amazonS3Push') },
          { id: 'AzureStorage-PUSH', name: translate('resources.transferprocesses.create.types.azureStoragePush') },
        ]}
        helperText={translate('resources.transferprocesses.create.fields.transferTypeHelper')}
      />
      <TransferTypeHandler />
      <FormDataConsumer>
        {({ formData }) => {
          switch (formData.transferType) {
            case 'HttpData-PUSH':
              return <HttpDataPush />
            case 'AmazonS3-PUSH':
              return <AmazonS3Push />
            case 'AzureStorage-PUSH':
              return <AzureStoragePush />
            default:
              return null
          }
        }}
      </FormDataConsumer>
    </>
  )
}

export default TransferProcessFormFields
