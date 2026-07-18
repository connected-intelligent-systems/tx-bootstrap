/// <reference types="vite/client" />
/// <reference types="vite-plugin-svgr/client" />

declare module 'ra-language-german' {
  import type { TranslationMessages } from 'ra-core'

  const germanMessages: TranslationMessages
  export default germanMessages
}

declare module 'process/browser' {
  import process from 'process'
  export default process
}

type PortalFilePickerWritable = {
  write: (data: Blob | ArrayBuffer | string) => Promise<void>
  close: () => Promise<void>
}

type PortalFilePickerHandle = {
  createWritable: () => Promise<PortalFilePickerWritable>
}

interface Window {
  showSaveFilePicker?: (options?: { suggestedName?: string }) => Promise<PortalFilePickerHandle>
}
