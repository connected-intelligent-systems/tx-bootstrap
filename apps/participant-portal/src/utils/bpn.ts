const BPNL_PATTERN = /^BPNL[A-Z0-9]{12}$/

export const parseBpns = (value: string): string[] =>
  Array.from(
    new Set(
      value
        .split(/[\s,;]+/)
        .map((entry) => entry.trim().toUpperCase())
        .filter(Boolean),
    ),
  )

export const invalidBpns = (value: string): string[] => parseBpns(value).filter((bpn) => !BPNL_PATTERN.test(bpn))
