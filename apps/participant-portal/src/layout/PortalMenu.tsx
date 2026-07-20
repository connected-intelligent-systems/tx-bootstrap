import { Menu, MenuItemLink, useTranslate } from 'react-admin'
import HomeIcon from '@mui/icons-material/Home'
import StorageIcon from '@mui/icons-material/Storage'
import SearchIcon from '@mui/icons-material/Search'
import InventoryIcon from '@mui/icons-material/Inventory'
import SettingsIcon from '@mui/icons-material/Settings'

export const PortalMenu = () => {
  const translate = useTranslate()
  return (
    <Menu dense={false} sx={{ pt: 1 }}>
      <MenuItemLink to="/" primaryText={translate('portalUx.nav.home')} leftIcon={<HomeIcon />} />
      <MenuItemLink
        to="/data-products"
        primaryText={translate('portalUx.nav.dataProducts')}
        leftIcon={<StorageIcon />}
      />
      <MenuItemLink to="/discover" primaryText={translate('portalUx.nav.discover')} leftIcon={<SearchIcon />} />
      <MenuItemLink to="/data-access" primaryText={translate('portalUx.nav.myData')} leftIcon={<InventoryIcon />} />
      <MenuItemLink to="/settings" primaryText={translate('portalUx.nav.settings')} leftIcon={<SettingsIcon />} />
    </Menu>
  )
}
