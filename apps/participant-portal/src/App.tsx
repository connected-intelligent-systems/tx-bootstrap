import { useEffect, useState, type ComponentProps } from 'react'
import { Admin, AppBar, CustomRoutes, Layout, Resource } from 'react-admin'
import { Navigate, Route } from 'react-router-dom'
import { Box, Container, Typography, useTheme } from '@mui/material'
import dataProvider from './dataProvider'
import { i18nProvider } from './i18n'
import { hasVisibleLogo, logoStyle } from '@tx-bootstrap/ui-runtime'
import { darkTheme, getThemeLogo, theme } from './theme'
import { PortalMenu } from './layout/PortalMenu'
import { HomeDashboard } from './pages/home'
import {
  DataAccessDetailPage,
  DataAccessPage,
  DataProductCreatePage,
  DataProductDetailPage,
  DataProductsPage,
  DiscoverDataPage,
} from './pages/dataProducts'
import { OnboardingFlow } from './pages/onboarding'
import { api } from './utils/onboarding-api'
import type { GatewayState } from './types/onboarding'
import { ApiClientsPage } from './pages/settings'

const CustomAppBar = (props: ComponentProps<typeof AppBar>) => {
  const currentTheme = useTheme()
  const paletteMode = currentTheme.palette.mode === 'dark' ? 'dark' : 'light'
  const logoConfig = getThemeLogo(paletteMode) || getThemeLogo('light') || undefined
  return (
    <AppBar {...props}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexGrow: 1, minWidth: 0 }}>
        {hasVisibleLogo(logoConfig) &&
          (logoConfig?.src ? (
            <Box
              component="img"
              src={logoConfig.src}
              alt={logoConfig.alt || window.config.title || 'Portal logo'}
              sx={{ height: 40, width: 40, flexShrink: 0, objectFit: 'contain', ...logoStyle(logoConfig.sx) }}
            />
          ) : (
            <Box
              component="span"
              role="img"
              aria-label={logoConfig?.alt || window.config.title || 'Portal logo'}
              sx={{ height: 40, width: 40, flexShrink: 0, ...logoStyle(logoConfig?.sx) }}
            />
          ))}
        {window.config.title && (
          <Typography variant="h6" color="inherit" noWrap>
            {window.config.title}
          </Typography>
        )}
      </Box>
    </AppBar>
  )
}

const CustomLayout = ({ children, ...props }: ComponentProps<typeof Layout>) => (
  <Layout {...props} menu={PortalMenu} appBar={CustomAppBar} sx={{ pt: 2 }}>
    <Container maxWidth="xl" sx={{ px: { xs: 2, sm: 3 } }}>
      {children}
    </Container>
  </Layout>
)

const PortalApp = () => (
  <Admin
    loginPage={false}
    layout={CustomLayout}
    dashboard={HomeDashboard}
    dataProvider={dataProvider}
    i18nProvider={i18nProvider}
    theme={theme}
    darkTheme={darkTheme}
    disableTelemetry
  >
    <CustomRoutes>
      <Route path="/data-products" element={<DataProductsPage />} />
      <Route path="/data-products/create" element={<DataProductCreatePage />} />
      <Route path="/data-products/:id" element={<DataProductDetailPage />} />
      <Route path="/discover" element={<DiscoverDataPage />} />
      <Route path="/data-access" element={<DataAccessPage />} />
      <Route path="/data-access/:id" element={<DataAccessDetailPage />} />
      <Route path="/my-data" element={<Navigate to="/data-access" replace />} />
      <Route path="/my-requests" element={<Navigate to="/data-access?status=pending" replace />} />
      <Route path="/my-data-access" element={<Navigate to="/data-access?status=active" replace />} />
      <Route path="/activity" element={<Navigate to="/data-access" replace />} />
      <Route path="/settings/api-clients" element={<ApiClientsPage />} />
    </CustomRoutes>
    <Resource name="assets" />
    <Resource name="policies" />
    <Resource name="contractdefinitions" />
    <Resource name="contractnegotiations" />
    <Resource name="contractagreements" />
    <Resource name="transferprocesses" />
    <Resource name="catalogs" />
    <Resource name="datasets" />
    <Resource name="datarequests" />
    <Resource name="contractagreementnegotiation" />
    <Resource name="dataaccesslifecycles" />
    <Resource name="dataaccessnegotiations" />
    <Resource name="dataaccessagreements" />
    <Resource name="dataaccesstransfers" />
  </Admin>
)

export const App = () => {
  const [isOnboarded, setIsOnboarded] = useState<boolean | null>(null)
  const [initialOnboardingState, setInitialOnboardingState] = useState<GatewayState>()
  useEffect(() => {
    api<GatewayState>('/api/onboarding/state')
      .then((data) => {
        setInitialOnboardingState(data)
        setIsOnboarded(data.onboarded)
      })
      .catch(() => setIsOnboarded(true))
  }, [])
  if (isOnboarded === null) return null
  if (!isOnboarded)
    return <OnboardingFlow initialState={initialOnboardingState} onComplete={() => setIsOnboarded(true)} />
  return <PortalApp />
}
