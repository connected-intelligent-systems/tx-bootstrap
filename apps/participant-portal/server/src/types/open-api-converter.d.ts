declare module '@thingweb/open-api-converter' {
  const convert: (thingDescription: Record<string, unknown>) => Promise<{ json: unknown; yaml: string }>
  export default convert
}
