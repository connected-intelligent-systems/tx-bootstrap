import { useState } from 'react'
import { AppBar, Box, Button, Container, IconButton, Menu, MenuItem, Toolbar, Tooltip, Typography } from '@mui/material'
import Brightness4Icon from '@mui/icons-material/Brightness4'
import Brightness7Icon from '@mui/icons-material/Brightness7'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import RefreshIcon from '@mui/icons-material/Refresh'
import TranslateIcon from '@mui/icons-material/Translate'
import { languageOptions } from '../../i18n/onboarding'
import { hasVisibleLogo } from '@tx-bootstrap/ui-runtime'
import { logoStyle } from '../../utils/onboarding-theme'
import type { ThemeLogoConfig } from '../../config'
import type { Language, ThemeMode } from '../../types/onboarding'

type PortalLogo = ThemeLogoConfig

export function TopBar(props: {
  language: Language
  logo?: PortalLogo
  themeMode: ThemeMode
  title: string
  onLanguageChange: (language: Language) => void
  onRefresh: () => void
  onToggleTheme: () => void
  refreshLabel: string
  themeLabel: string
  portalLogoLabel: string
  disabled: boolean
}) {
  return (
    <AppBar position="static" color="secondary" elevation={0} sx={{ borderBottom: 1, borderColor: 'divider' }}>
      <Container maxWidth="lg">
        <Toolbar disableGutters variant="dense" sx={{ gap: 2, minHeight: { xs: 56, sm: 50 }, py: 0.75 }}>
          {hasVisibleLogo(props.logo) &&
            (props.logo?.src ? (
              <Box
                component="img"
                src={props.logo.src}
                alt={props.logo.alt || props.title || props.portalLogoLabel}
                sx={{
                  display: 'block',
                  maxHeight: 40,
                  maxWidth: 160,
                  objectFit: 'contain',
                  ...logoStyle(props.logo.sx),
                }}
              />
            ) : (
              <Box
                component="span"
                role="img"
                aria-label={props.logo?.alt || props.title || props.portalLogoLabel}
                sx={{ display: 'block', height: 40, width: 40, ...logoStyle(props.logo?.sx) }}
              />
            ))}
          <Typography variant="h6" color="inherit" noWrap sx={{ flexGrow: 1, fontWeight: 800 }}>
            {props.title}
          </Typography>
          <LocaleMenuButton language={props.language} onChange={props.onLanguageChange} />
          <Tooltip title={props.themeLabel} enterDelay={300}>
            <IconButton color="inherit" aria-label={props.themeLabel} onClick={props.onToggleTheme}>
              {props.themeMode === 'dark' ? <Brightness7Icon /> : <Brightness4Icon />}
            </IconButton>
          </Tooltip>
          <Tooltip title={props.refreshLabel} enterDelay={300}>
            <span>
              <IconButton
                color="inherit"
                aria-label={props.refreshLabel}
                onClick={props.onRefresh}
                disabled={props.disabled}
              >
                <RefreshIcon />
              </IconButton>
            </span>
          </Tooltip>
        </Toolbar>
      </Container>
    </AppBar>
  )
}

function LocaleMenuButton(props: { language: Language; onChange: (language: Language) => void }) {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null)
  const open = Boolean(anchorEl)
  const current = languageOptions.find((option) => option.value === props.language) ?? languageOptions[0]

  return (
    <>
      <Button
        color="inherit"
        variant="text"
        aria-controls={open ? 'language-menu' : undefined}
        aria-haspopup="true"
        aria-expanded={open ? 'true' : undefined}
        startIcon={<TranslateIcon />}
        endIcon={<ExpandMoreIcon fontSize="small" />}
        onClick={(event) => setAnchorEl(event.currentTarget)}
      >
        {current.label}
      </Button>
      <Menu id="language-menu" anchorEl={anchorEl} open={open} onClose={() => setAnchorEl(null)}>
        {languageOptions.map((option) => (
          <MenuItem
            key={option.value}
            selected={option.value === props.language}
            onClick={() => {
              props.onChange(option.value)
              setAnchorEl(null)
            }}
          >
            {option.label}
          </MenuItem>
        ))}
      </Menu>
    </>
  )
}
