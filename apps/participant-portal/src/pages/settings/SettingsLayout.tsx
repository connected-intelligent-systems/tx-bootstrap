import { Box, Tab, Tabs } from '@mui/material'
import { useTranslate } from 'react-admin'
import { Link, Outlet, useLocation } from 'react-router-dom'

export const SettingsLayout = () => {
  const translate = useTranslate()
  const location = useLocation()
  const activeSection = location.pathname.includes('/partner-groups') ? 'partner-groups' : 'api-clients'

  return (
    <Box>
      <Tabs
        value={activeSection}
        aria-label={translate('portalUx.settings.navigation')}
        sx={{ mb: 3, borderBottom: 1, borderColor: 'divider' }}
      >
        <Tab
          component={Link}
          to="/settings/api-clients"
          value="api-clients"
          label={translate('portalUx.settings.apiClients')}
        />
        <Tab
          component={Link}
          to="/settings/partner-groups"
          value="partner-groups"
          label={translate('portalUx.settings.partnerGroups')}
        />
      </Tabs>
      <Outlet />
    </Box>
  )
}
