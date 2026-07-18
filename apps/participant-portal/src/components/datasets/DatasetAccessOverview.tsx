import { RecordContextProvider, useLocale, useTranslate } from 'react-admin'
import { Box, Divider, Typography } from '@mui/material'
import CloudIcon from '@mui/icons-material/Cloud'
import type { Dataset } from '../../types/catalog'
import { getAbstractValue } from '../../utils/multiLanguageUtils'
import { BasicInformation, getAssetSections, type AssetSection } from '../assets'
import { MarkdownField } from '../markdown'
import { ServiceInformation } from './ServiceInformation'

export const DatasetAccessOverviewContent = ({ dataset }: { dataset: Dataset }) => {
  const translate = useTranslate()
  const locale = useLocale()
  const abstract = getAbstractValue(dataset.abstracts, dataset.abstract, locale)
  const showDetailedDescription = Boolean(dataset.description && dataset.description.trim() !== abstract?.trim())

  return (
    <RecordContextProvider value={dataset}>
      <Box>
        <Typography variant="h6" sx={{ mb: 2 }}>
          {translate('resources.assets.tabs.basicInformation.title')}
        </Typography>
        <BasicInformation />
        {showDetailedDescription && (
          <>
            <Divider sx={{ my: 3 }} />
            <Typography variant="h6" sx={{ mb: 2 }}>
              {translate('resources.assets.tabs.detailedDescription')}
            </Typography>
            <MarkdownField source="description" />
          </>
        )}
      </Box>
    </RecordContextProvider>
  )
}

export function buildDatasetAccessSections(
  dataset: Dataset,
  translate: ReturnType<typeof useTranslate>,
): AssetSection[] {
  const assetSections = getAssetSections(dataset, translate)
  const thingDescription = assetSections.find((section) => section.id === 'thing-description')
  const sections = assetSections.filter(
    (section) => !['basic-info', 'description', 'thing-description', 'raw'].includes(section.id),
  )

  if (dataset.distributions?.length) {
    sections.push({
      id: 'service-info',
      icon: <CloudIcon />,
      label: translate('resources.catalog.dataset.tabs.serviceInfo'),
      ariaControls: 'data-access-service-info',
      component: <ServiceInformation dataset={dataset} />,
    })
  }
  if (thingDescription) sections.push(thingDescription)
  return sections
}
