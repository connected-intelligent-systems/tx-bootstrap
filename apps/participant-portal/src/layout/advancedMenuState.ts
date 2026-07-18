export const ADVANCED_MENU_STORAGE_KEY = 'participant-portal.advanced-menu-open'

type MenuStorage = Pick<Storage, 'getItem' | 'setItem'>

const browserStorage = (): MenuStorage | undefined => {
  try {
    return window.localStorage
  } catch {
    return undefined
  }
}

export const readAdvancedMenuState = (storage = browserStorage()) => {
  try {
    return storage?.getItem(ADVANCED_MENU_STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

export const writeAdvancedMenuState = (open: boolean, storage = browserStorage()) => {
  try {
    storage?.setItem(ADVANCED_MENU_STORAGE_KEY, String(open))
  } catch {
    // The menu remains usable if browser storage is unavailable.
  }
}
