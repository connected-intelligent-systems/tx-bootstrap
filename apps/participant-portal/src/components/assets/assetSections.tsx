import { useState, type ReactElement, type ReactNode } from 'react'
import { FunctionField, useTranslate } from 'react-admin'
import { Box, Tab, Tabs, Typography } from '@mui/material'
import CodeIcon from '@mui/icons-material/Code'
import InfoIcon from '@mui/icons-material/Info'
import DescriptionIcon from '@mui/icons-material/Description'
import AccountTreeIcon from '@mui/icons-material/AccountTree'
import SecurityIcon from '@mui/icons-material/Security'
import AssessmentIcon from '@mui/icons-material/Assessment'
import CloudIcon from '@mui/icons-material/Cloud'
import DevicesIcon from '@mui/icons-material/Devices'
import { MarkdownField } from '../markdown'
import { Raw } from './Raw'
import { BasicInformation } from './BasicInformation'
import { Provenance } from './Provenance'
import { DataPrivacy } from './DataPrivacy'
import { DataQuality } from './DataQuality'
import { DataAddress } from './DataAddress'
import { ThingDescription } from './ThingDescription'

export interface AssetSection {
  id: string
  icon: ReactElement
  label: string
  ariaControls: string
  component: ReactNode
}

const hasRaw = (record: any) => !!record?.raw

const hasBasicInformation = (record: any) =>
  !!(
    record?.theme?.title ||
    record?.mediaType ||
    (record?.keywords && record.keywords.length > 0) ||
    record?.version ||
    record?.creator?.name ||
    record?.created ||
    record?.modified ||
    record?.abstract
  )

const hasDescription = (record: any) => !!record?.description

const hasProvenance = (record: any) =>
  !!(
    record?.provenance?.derivedFromId ||
    record?.provenance?.generatedByDescription ||
    record?.provenance?.attributedToId
  )

const hasDataPrivacy = (record: any) =>
  !!(
    record?.privacySettings?.personalDataHandling &&
    Array.isArray(record.privacySettings.personalDataHandling) &&
    record.privacySettings.personalDataHandling.length > 0
  )

const hasDataQuality = (record: any) =>
  !!(record?.qualityMeasurements && Array.isArray(record.qualityMeasurements) && record.qualityMeasurements.length > 0)

const hasDataAddress = (record: any) => !!record?.dataAddress?.type

const hasThingDescription = (record: any) => !!record?.thingDescription

export const getAssetSections = (record: any, translate: ReturnType<typeof useTranslate>): AssetSection[] => {
  const sections: AssetSection[] = []

  if (hasBasicInformation(record)) {
    sections.push({
      id: 'basic-info',
      icon: <InfoIcon />,
      label: translate('resources.assets.tabs.basicInformation.title'),
      ariaControls: 'asset-basic-info',
      component: <BasicInformation />,
    })
  }

  if (hasDescription(record)) {
    sections.push({
      id: 'description',
      icon: <DescriptionIcon />,
      label: translate('resources.assets.tabs.detailedDescription'),
      ariaControls: 'asset-description',
      component: (
        <FunctionField
          render={(record: any) => {
            const description = record?.description
            if (!description) {
              return (
                <Typography variant="body2" color="text.secondary">
                  {translate('resources.assets.messages.noDescription')}
                </Typography>
              )
            }
            return <MarkdownField source="description" record={{ description }} />
          }}
        />
      ),
    })
  }

  if (hasProvenance(record)) {
    sections.push({
      id: 'provenance',
      icon: <AccountTreeIcon />,
      label: translate('resources.assets.tabs.provenance'),
      ariaControls: 'asset-provenance',
      component: <Provenance />,
    })
  }

  if (hasDataPrivacy(record)) {
    sections.push({
      id: 'privacy',
      icon: <SecurityIcon />,
      label: translate('resources.assets.tabs.dataPrivacy'),
      ariaControls: 'asset-privacy',
      component: <DataPrivacy />,
    })
  }

  if (hasDataQuality(record)) {
    sections.push({
      id: 'quality',
      icon: <AssessmentIcon />,
      label: translate('resources.assets.tabs.dataQuality'),
      ariaControls: 'asset-quality',
      component: <DataQuality />,
    })
  }

  if (hasDataAddress(record)) {
    sections.push({
      id: 'address',
      icon: <CloudIcon />,
      label: translate('resources.assets.tabs.dataAddress'),
      ariaControls: 'asset-address',
      component: <DataAddress />,
    })
  }

  if (hasThingDescription(record)) {
    sections.push({
      id: 'thing-description',
      icon: <DevicesIcon />,
      label: translate('resources.assets.tabs.thingDescription'),
      ariaControls: 'asset-thing-description',
      component: <ThingDescription />,
    })
  }

  if (hasRaw(record)) {
    sections.push({
      id: 'raw',
      icon: <CodeIcon />,
      label: 'Raw',
      ariaControls: 'asset-raw',
      component: <Raw />,
    })
  }

  return sections
}

export const AssetSectionTabs = ({ sections }: { sections: AssetSection[] }) => {
  const [activeTab, setActiveTab] = useState(0)

  if (sections.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
        No additional information available
      </Typography>
    )
  }

  return (
    <Box>
      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs
          value={activeTab}
          onChange={(_, value) => setActiveTab(value)}
          aria-label="asset information tabs"
          variant="scrollable"
          scrollButtons="auto"
          allowScrollButtonsMobile
        >
          {sections.map((section) => (
            <Tab key={section.id} icon={section.icon} label={section.label} aria-controls={section.ariaControls} />
          ))}
        </Tabs>
      </Box>
      <Box sx={{ mt: 3 }}>
        {sections.map((section, index) => (
          <div key={section.id} id={section.ariaControls} role="tabpanel" hidden={activeTab !== index}>
            {activeTab === index && section.component}
          </div>
        ))}
      </Box>
    </Box>
  )
}
