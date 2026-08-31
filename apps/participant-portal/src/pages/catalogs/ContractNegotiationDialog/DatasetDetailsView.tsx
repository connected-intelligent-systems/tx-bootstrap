import React, { useMemo, useState } from 'react'
import { RecordContextProvider, useTranslate } from 'react-admin'
import { Box, Tab, Tabs, Typography } from '@mui/material'
import InfoIcon from '@mui/icons-material/Info'
import DescriptionIcon from '@mui/icons-material/Description'
import HistoryIcon from '@mui/icons-material/History'
import AccountTreeIcon from '@mui/icons-material/AccountTree'
import SecurityIcon from '@mui/icons-material/Security'
import AssessmentIcon from '@mui/icons-material/Assessment'
import CloudIcon from '@mui/icons-material/Cloud'
import DevicesIcon from '@mui/icons-material/Devices'
import { Dataset } from '../../../types/catalog'
import {
  BasicInformation,
  Provenance,
  DataPrivacy,
  DataQuality,
  Versioning,
  ApiDescription,
} from '../../../components/assets'
import { ServiceInformation } from '../../../components/datasets'
import { MarkdownField } from '../../../components/markdown'

interface DatasetDetailsViewProps {
  dataset: Dataset
  isMobile: boolean
}

interface DatasetTabDefinition {
  id: string
  icon: React.ReactElement
  labelTranslationKey: string
  ariaControls: string
  isVisible: (_dataset: Dataset) => boolean
  render: (_dataset: Dataset) => React.ReactNode
}

const withRecordContext = (dataset: Dataset, content: React.ReactNode) => (
  <RecordContextProvider value={dataset}>{content}</RecordContextProvider>
)

const DATASET_TABS: DatasetTabDefinition[] = [
  {
    id: 'overview',
    icon: <InfoIcon />,
    labelTranslationKey: 'resources.catalog.dataset.tabs.overview',
    ariaControls: 'dataset-overview-tab',
    isVisible: (dataset) =>
      !!(
        dataset?.theme?.title ||
        dataset?.mediaType ||
        dataset?.keywords?.length ||
        dataset?.version ||
        dataset?.creator?.name ||
        dataset?.created ||
        dataset?.modified ||
        dataset?.abstract
      ),
    render: (dataset) => withRecordContext(dataset, <BasicInformation />),
  },
  {
    id: 'description',
    icon: <DescriptionIcon />,
    labelTranslationKey: 'resources.assets.tabs.detailedDescription',
    ariaControls: 'dataset-description-tab',
    isVisible: (dataset) => !!dataset.description,
    render: (dataset) => withRecordContext(dataset, <MarkdownField source="description" />),
  },
  {
    id: 'versioning',
    icon: <HistoryIcon />,
    labelTranslationKey: 'resources.catalog.dataset.tabs.versioning',
    ariaControls: 'dataset-versioning-tab',
    isVisible: (dataset) => !!(dataset?.version || dataset?.creator?.name || dataset?.modified || dataset?.created),
    render: (dataset) => withRecordContext(dataset, <Versioning />),
  },
  {
    id: 'provenance',
    icon: <AccountTreeIcon />,
    labelTranslationKey: 'resources.catalog.dataset.tabs.provenance',
    ariaControls: 'dataset-provenance-tab',
    isVisible: (dataset) =>
      !!(
        dataset?.provenance?.derivedFromId ||
        dataset?.provenance?.generatedByDescription ||
        dataset?.provenance?.attributedToId
      ),
    render: (dataset) => withRecordContext(dataset, <Provenance />),
  },
  {
    id: 'privacy',
    icon: <SecurityIcon />,
    labelTranslationKey: 'resources.catalog.dataset.tabs.dataPrivacy',
    ariaControls: 'dataset-privacy-tab',
    isVisible: (dataset) => !!dataset?.privacySettings?.personalDataHandling?.length,
    render: (dataset) => withRecordContext(dataset, <DataPrivacy />),
  },
  {
    id: 'quality',
    icon: <AssessmentIcon />,
    labelTranslationKey: 'resources.catalog.dataset.tabs.dataQuality',
    ariaControls: 'dataset-quality-tab',
    isVisible: (dataset) => !!dataset?.qualityMeasurements?.length,
    render: (dataset) => withRecordContext(dataset, <DataQuality />),
  },
  {
    id: 'api-description',
    icon: <DevicesIcon />,
    labelTranslationKey: 'resources.assets.tabs.apiDescription',
    ariaControls: 'dataset-api-description-tab',
    isVisible: (dataset) => !!dataset?.apiDescription,
    render: (dataset) => withRecordContext(dataset, <ApiDescription />),
  },
  {
    id: 'service-info',
    icon: <CloudIcon />,
    labelTranslationKey: 'resources.catalog.dataset.tabs.serviceInfo',
    ariaControls: 'dataset-service-tab',
    isVisible: (dataset) => !!dataset?.distributions?.length,
    render: (dataset) => <ServiceInformation dataset={dataset} />,
  },
]

export const DatasetDetailsView = ({ dataset, isMobile }: DatasetDetailsViewProps) => {
  const translate = useTranslate()
  const [activeTab, setActiveTab] = useState(0)
  const visibleTabs = useMemo(() => DATASET_TABS.filter((tab) => tab.isVisible(dataset)), [dataset])
  const selectedTab = visibleTabs[activeTab]

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%' }}>
      {visibleTabs.length > 0 && (
        <Box sx={{ borderBottom: 1, borderColor: 'divider', flexShrink: 0 }}>
          <Tabs
            value={activeTab}
            onChange={(_, newValue: number) => setActiveTab(newValue)}
            aria-label="dataset information tabs"
            variant={isMobile ? 'scrollable' : 'standard'}
            scrollButtons="auto"
          >
            {visibleTabs.map((tab, index) => (
              <Tab
                key={tab.id}
                icon={tab.icon}
                label={translate(tab.labelTranslationKey)}
                aria-controls={tab.ariaControls}
                id={`dataset-tab-${index}`}
              />
            ))}
          </Tabs>
        </Box>
      )}

      <Box sx={{ p: 3, flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {selectedTab ? (
          selectedTab.render(dataset)
        ) : (
          <Typography variant="body2" color="text.secondary">
            No additional information available
          </Typography>
        )}
      </Box>
    </Box>
  )
}
