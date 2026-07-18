import { Box, Card, CardActionArea, CardContent, Chip, Typography } from '@mui/material'
import ArrowForwardIcon from '@mui/icons-material/ArrowForward'
import BusinessIcon from '@mui/icons-material/Business'
import PolicyIcon from '@mui/icons-material/Policy'
import { useLocale, useTranslate } from 'react-admin'
import type { DiscoveredDataProduct } from '../../types/dataProduct'
import { getAbstractValue, getTitleValue } from '../../utils/multiLanguageUtils'

export const DiscoverDataProductCard = ({
  product,
  index,
  onOpen,
}: {
  product: DiscoveredDataProduct
  index: number
  onOpen: () => void
}) => {
  const translate = useTranslate()
  const locale = useLocale()
  const { dataset } = product
  const title = getTitleValue(dataset.titles, dataset.title, locale) || product.title
  const description = getAbstractValue(dataset.abstracts, dataset.abstract, locale) || dataset.description
  const keywords = dataset.keywords || []
  const visibleKeywords = keywords.slice(0, 3)

  return (
    <Card sx={{ height: '100%' }}>
      <CardActionArea
        onClick={onOpen}
        sx={{ height: '100%', display: 'flex', alignItems: 'stretch' }}
        aria-describedby={`discovered-product-description-${index}`}
      >
        <CardContent sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1 }}>
            <Typography variant="h6" component="h3">
              {title}
            </Typography>
            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {product.stale && <Chip size="small" color="warning" label={translate('portalUx.discover.stale')} />}
              <Chip
                size="small"
                color="primary"
                label={translate('portalUx.discover.availableOffers', { smart_count: product.offers.length })}
              />
            </Box>
          </Box>
          {(dataset.theme?.title || dataset.mediaType) && (
            <Box sx={{ display: 'flex', gap: 0.5, mt: 1.5, flexWrap: 'wrap' }}>
              {dataset.theme?.title && (
                <Chip size="small" label={dataset.theme.title} color="primary" variant="outlined" />
              )}
              {dataset.mediaType && <Chip size="small" label={dataset.mediaType} variant="outlined" />}
            </Box>
          )}
          <Typography
            id={`discovered-product-description-${index}`}
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
                {translate('portalUx.discover.availableOffers', { smart_count: product.offers.length })}
              </Typography>
            </Box>
            {product.providerId && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0 }}>
                <BusinessIcon fontSize="small" color="action" />
                <Typography variant="body2" color="text.secondary" noWrap sx={{ maxWidth: 180 }}>
                  {product.providerName || product.participantBpn || product.providerId}
                </Typography>
              </Box>
            )}
            <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 0.5, color: 'primary.main' }}>
              <Typography variant="button">{translate('portalUx.discover.viewDetails')}</Typography>
              <ArrowForwardIcon fontSize="small" />
            </Box>
          </Box>
        </CardContent>
      </CardActionArea>
    </Card>
  )
}
