import React, { useMemo } from 'react'
import { Box, Card, CardContent, Chip, InputLabel, MenuItem, Select, Typography } from '@mui/material'
import type { SelectChangeEvent } from '@mui/material/Select'
import { useTranslate } from 'react-admin'
import { policySummary } from '../../../services/dataProductViewModels'

interface PolicySelectionViewProps {
  policies: any[]
  selectedPolicy: number
  onSelectPolicy: (index: number) => void
}

export const PolicySelectionView: React.FC<PolicySelectionViewProps> = ({
  policies,
  selectedPolicy,
  onSelectPolicy,
}) => {
  const translate = useTranslate()
  const options = useMemo(
    () => policies.map((_, index) => ({ index, label: `${translate('portalUx.policy.availableOffer')} ${index + 1}` })),
    [policies, translate],
  )
  if (!policies.length)
    return (
      <Box sx={{ textAlign: 'center', py: 4 }}>
        <Typography variant="h6">{translate('resources.catalog.dataset.noPolicies')}</Typography>
        <Typography color="text.secondary" sx={{ mt: 1 }}>
          {translate('resources.catalog.dataset.noPoliciesDescription')}
        </Typography>
      </Box>
    )
  const selected = policies[selectedPolicy]
  const handleChange = (event: SelectChangeEvent<string>) => onSelectPolicy(Number(event.target.value))
  return (
    <Box sx={{ width: '100%', minWidth: 0 }}>
      <Typography variant="h6">{translate('portalUx.policy.choose')}</Typography>
      <Typography color="text.secondary" sx={{ mt: 0.5, mb: 2 }}>
        {translate('portalUx.policy.chooseHelp')}
      </Typography>
      <Box>
        <InputLabel id="policy-selection-label">{translate('portalUx.policy.availableOffer')}</InputLabel>
        <Select fullWidth labelId="policy-selection-label" value={String(selectedPolicy)} onChange={handleChange}>
          {options.map((option) => (
            <MenuItem key={option.index} value={String(option.index)}>
              {option.label}
            </MenuItem>
          ))}
        </Select>
      </Box>
      <Card variant="outlined" sx={{ mt: 3 }}>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1 }}>
            <Typography variant="h6">{translate('portalUx.policy.terms')}</Typography>
            <Chip size="small" color="primary" label="Tractus-X" />
          </Box>
          <Typography variant="body2" sx={{ mt: 1 }}>
            {policySummary(selected)}
          </Typography>
        </CardContent>
      </Card>
    </Box>
  )
}
