import { Box, Card, CardActionArea, CardContent, Chip, Typography } from '@mui/material'
import HandshakeIcon from '@mui/icons-material/Handshake'
import PolicyIcon from '@mui/icons-material/Policy'
import ArrowForwardIcon from '@mui/icons-material/ArrowForward'
import { useLocale, useTranslate } from 'react-admin'
import type { Asset } from '../../types/asset'
import { getAbstractValue, getTitleValue } from '../../utils/multiLanguageUtils'

type DataProductCardProps = {
  asset: Asset
  index: number
  published: boolean
  offerCount: number
  agreementCount: number
  onOpen: () => void
}

export const DataProductCard = ({
  asset,
  index,
  published,
  offerCount,
  agreementCount,
  onOpen,
}: DataProductCardProps) => {
  const translate = useTranslate()
  const locale = useLocale()
  const title =
    getTitleValue(asset.titles, asset.title, locale) || asset.id || translate('portalUx.dataProducts.untitled')
  const description = getAbstractValue(asset.abstracts, asset.abstract, locale) || asset.description
  const category = asset.theme?.title
  const keywords = asset.keywords || []
  const visibleKeywords = keywords.slice(0, 3)

  return (
    <Card sx={{ height: '100%' }}>
      <CardActionArea
        onClick={onOpen}
        sx={{ height: '100%', display: 'flex', alignItems: 'stretch' }}
        aria-label={translate('portalUx.dataProducts.openAria', { title })}
        aria-describedby={`data-product-description-${index}`}
      >
        <CardContent sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1 }}>
            <Typography variant="h6" component="h3">
              {title}
            </Typography>
            <Chip
              size="small"
              color={published ? 'primary' : 'default'}
              variant={published ? 'filled' : 'outlined'}
              label={translate(published ? 'portalUx.dataProducts.published' : 'portalUx.dataProducts.private')}
            />
          </Box>

          {(category || asset.mediaType) && (
            <Box sx={{ display: 'flex', gap: 0.5, mt: 1.5, flexWrap: 'wrap' }}>
              {category && <Chip size="small" label={category} color="primary" variant="outlined" />}
              {asset.mediaType && <Chip size="small" label={asset.mediaType} variant="outlined" />}
            </Box>
          )}

          <Typography
            variant="body2"
            color="text.secondary"
            sx={{
              mt: 2,
              lineHeight: 1.5,
              fontStyle: description ? 'normal' : 'italic',
              display: '-webkit-box',
              WebkitLineClamp: 3,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              minHeight: '4.5em',
            }}
            id={`data-product-description-${index}`}
          >
            {description || translate('resources.catalog.dataset.noDescriptionAvailable')}
          </Typography>

          {visibleKeywords.length > 0 && (
            <Box sx={{ display: 'flex', gap: 0.5, mt: 2, flexWrap: 'wrap' }}>
              {visibleKeywords.map((keyword) => (
                <Chip key={keyword} size="small" label={keyword} color="secondary" variant="outlined" />
              ))}
              {keywords.length > visibleKeywords.length && (
                <Chip size="small" label={`+${keywords.length - visibleKeywords.length}`} variant="outlined" />
              )}
            </Box>
          )}

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 'auto', pt: 2, flexWrap: 'wrap' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <PolicyIcon fontSize="small" color="action" />
              <Typography variant="body2" color="text.secondary">
                {translate('portalUx.dataProducts.offers', { smart_count: offerCount })}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <HandshakeIcon fontSize="small" color="action" />
              <Typography variant="body2" color="text.secondary">
                {translate('portalUx.dataProducts.agreements', { smart_count: agreementCount })}
              </Typography>
            </Box>
            <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 0.5, color: 'primary.main' }}>
              <Typography variant="button">{translate('portalUx.dataProducts.manage')}</Typography>
              <ArrowForwardIcon fontSize="small" />
            </Box>
          </Box>
        </CardContent>
      </CardActionArea>
    </Card>
  )
}
