import { useState, type MouseEvent as ReactMouseEvent } from 'react'
import { useArrayInput } from 'ra-core'
import { useTranslate } from 'react-admin'
import { Menu, IconButton, ListItemIcon, MenuItem } from '@mui/material'
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutlineOutlined'
import PermIdentityIcon from '@mui/icons-material/PermIdentity'
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser'
import GroupsIcon from '@mui/icons-material/Groups'
import HandshakeIcon from '@mui/icons-material/Handshake'
import RuleIcon from '@mui/icons-material/Rule'

const presetRules: Record<string, any> = {
  membership: {
    action: 'access',
    constraints: [{ leftOperand: 'Membership', operator: 'eq', rightOperand: 'active' }],
  },
  businessPartnerNumber: {
    action: 'access',
    constraints: [
      {
        leftOperand: 'BusinessPartnerNumber',
        operator: 'isAnyOf',
        rightOperand: ['BPNL000000000000'],
      },
    ],
  },
  businessPartnerGroup: {
    action: 'access',
    constraints: [
      {
        leftOperand: 'BusinessPartnerGroup',
        operator: 'isAnyOf',
        rightOperand: ['group'],
      },
    ],
  },
  dataExchange: {
    action: 'use',
    constraints: [
      {
        leftOperand: 'FrameworkAgreement',
        operator: 'eq',
        rightOperand: 'DataExchangeGovernance:1.0',
      },
      {
        leftOperand: 'UsagePurpose',
        operator: 'isAnyOf',
        rightOperand: ['cx.core.industrycore:1'],
      },
    ],
  },
  tractusxAdvanced: {
    action: 'use',
    constraints: [
      {
        leftOperand: 'UsagePurpose',
        operator: 'isAnyOf',
        rightOperand: ['cx.core.industrycore:1'],
      },
    ],
  },
}

export const CustomAddButton = () => {
  const context = useArrayInput()
  const translate = useTranslate()
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null)
  const open = Boolean(anchorEl)

  const handleClick = (event: ReactMouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget)
  }

  const handleClose = () => {
    setAnchorEl(null)
  }

  const handleAddTractusX = (event: ReactMouseEvent<HTMLElement>) => {
    const value = (event.currentTarget as HTMLElement).getAttribute('value') || 'tractusxAdvanced'
    context.append(JSON.parse(JSON.stringify(presetRules[value])))
    setAnchorEl(null)
  }

  return (
    <>
      <IconButton color="primary" onClick={handleClick}>
        <AddCircleOutlineIcon />
      </IconButton>
      <Menu anchorEl={anchorEl} open={open} onClose={handleClose}>
        <MenuItem value="membership" onClick={handleAddTractusX} disableRipple>
          <ListItemIcon>
            <VerifiedUserIcon />
          </ListItemIcon>
          {translate('resources.policies.create.permissions.membership')}
        </MenuItem>
        <MenuItem value="businessPartnerNumber" onClick={handleAddTractusX} disableRipple>
          <ListItemIcon>
            <PermIdentityIcon />
          </ListItemIcon>
          {translate('resources.policies.create.permissions.businessPartnerNumber')}
        </MenuItem>
        <MenuItem value="businessPartnerGroup" onClick={handleAddTractusX} disableRipple>
          <ListItemIcon>
            <GroupsIcon />
          </ListItemIcon>
          {translate('resources.policies.create.permissions.businessPartnerGroup')}
        </MenuItem>
        <MenuItem value="dataExchange" onClick={handleAddTractusX} disableRipple>
          <ListItemIcon>
            <HandshakeIcon />
          </ListItemIcon>
          {translate('resources.policies.create.permissions.dataExchange')}
        </MenuItem>
        <MenuItem value="tractusxAdvanced" onClick={handleAddTractusX} disableRipple>
          <ListItemIcon>
            <RuleIcon />
          </ListItemIcon>
          {translate('resources.policies.create.permissions.tractusxAdvanced')}
        </MenuItem>
      </Menu>
    </>
  )
}
