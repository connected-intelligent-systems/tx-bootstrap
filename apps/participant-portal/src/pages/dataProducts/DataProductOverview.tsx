import { DateField, FunctionField, SimpleShowLayout, TextField, useTranslate } from 'react-admin'
import { Box, Card, CardContent, Chip, Typography } from '@mui/material'
import type { Asset } from '../../types/asset'
import { MarkdownField } from '../../components/markdown'

export const DataProductOverview = ({ asset }: { asset: Asset }) => {
  const translate = useTranslate()
  return (
    <Card variant="outlined">
      <CardContent>
        <Typography variant="h6" sx={{ mb: 1 }}>
          {translate('portalUx.product.details')}
        </Typography>
        <SimpleShowLayout
          sx={{
            p: 0,
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' },
            columnGap: 4,
            rowGap: 1,
          }}
        >
          <TextField source="id" label={translate('portalUx.dataProducts.technicalId')} />
          <TextField
            source="theme.title"
            label={translate('resources.assets.tabs.basicInformation.category')}
            emptyText="-"
          />
          <TextField
            source="mediaType"
            label={translate('resources.assets.tabs.basicInformation.mediaType')}
            emptyText="-"
          />
          <FunctionField
            label={translate('resources.assets.tabs.basicInformation.keywords')}
            render={(record: Asset) =>
              record.keywords?.length ? (
                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                  {record.keywords.map((keyword) => (
                    <Chip key={keyword} label={keyword} size="small" variant="outlined" />
                  ))}
                </Box>
              ) : (
                '-'
              )
            }
          />
          <TextField source="version" label={translate('resources.assets.tabs.versioningTab.version')} emptyText="-" />
          <TextField
            source="creator.name"
            label={translate('resources.assets.tabs.versioningTab.creator')}
            emptyText="-"
          />
          <DateField source="created" label={translate('resources.assets.tabs.versioningTab.created')} emptyText="-" />
          <DateField
            source="modified"
            label={translate('resources.assets.tabs.versioningTab.modified')}
            emptyText="-"
          />
        </SimpleShowLayout>
        {asset.description && (
          <Box sx={{ mt: 3, pt: 3, borderTop: 1, borderColor: 'divider' }}>
            <Typography variant="h6" sx={{ mb: 2 }}>
              {translate('resources.assets.tabs.detailedDescription')}
            </Typography>
            <MarkdownField source="description" record={asset} />
          </Box>
        )}
      </CardContent>
    </Card>
  )
}
