import { describe, expect, it, vi } from 'vitest'
import {
  ADVANCED_MENU_STORAGE_KEY,
  readAdvancedMenuState,
  writeAdvancedMenuState,
} from '../../layout/advancedMenuState'

describe('advanced menu state', () => {
  it('is collapsed when no preference is stored', () => {
    expect(readAdvancedMenuState({ getItem: () => null, setItem: vi.fn() })).toBe(false)
  })

  it('restores and persists the expanded state', () => {
    const setItem = vi.fn()
    const storage = { getItem: () => 'true', setItem }

    expect(readAdvancedMenuState(storage)).toBe(true)
    writeAdvancedMenuState(false, storage)
    expect(setItem).toHaveBeenCalledWith(ADVANCED_MENU_STORAGE_KEY, 'false')
  })
})
