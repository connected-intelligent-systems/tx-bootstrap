import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Autocomplete, TextField } from '@mui/material'
import { useTranslate } from 'react-admin'
import { CatalogConnectionService } from '../../services/catalogConnectionService'

interface ParticipantOption {
  bpn: string
  name: string
}

export const ParticipantMultiSelect = ({
  value,
  onChange,
  label,
  helperText,
  error = false,
  disabled = false,
}: {
  value: string[]
  onChange: (bpns: string[]) => void
  label: string
  helperText?: ReactNode
  error?: boolean
  disabled?: boolean
}) => {
  const translate = useTranslate()
  const [directoryOptions, setDirectoryOptions] = useState<ParticipantOption[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string>()

  useEffect(() => {
    let active = true
    setLoading(true)
    CatalogConnectionService.getCatalogs()
      .then((catalogs) => {
        if (!active) return
        const options = catalogs.flatMap((catalog) =>
          catalog.participantBpn ? [{ bpn: catalog.participantBpn, name: catalog.name || catalog.participantBpn }] : [],
        )
        setDirectoryOptions(options)
        setLoadError(CatalogConnectionService.getDirectoryError())
      })
      .catch((directoryError) => {
        if (active) setLoadError(directoryError instanceof Error ? directoryError.message : String(directoryError))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  const options = useMemo(() => {
    const byBpn = new Map(directoryOptions.map((option) => [option.bpn, option]))
    for (const bpn of value) {
      if (!byBpn.has(bpn)) byBpn.set(bpn, { bpn, name: bpn })
    }
    return Array.from(byBpn.values()).sort((left, right) => left.name.localeCompare(right.name))
  }, [directoryOptions, value])
  const selected = value.map((bpn) => options.find((option) => option.bpn === bpn) || { bpn, name: bpn })

  return (
    <Autocomplete
      multiple
      filterSelectedOptions
      disabled={disabled}
      loading={loading}
      options={options}
      value={selected}
      onChange={(_event, participants) => onChange(participants.map((participant) => participant.bpn))}
      isOptionEqualToValue={(option, selectedOption) => option.bpn === selectedOption.bpn}
      getOptionLabel={(option) => (option.name === option.bpn ? option.bpn : `${option.name} — ${option.bpn}`)}
      noOptionsText={
        loadError
          ? translate('portalUx.participantSelect.unavailable')
          : translate('portalUx.participantSelect.noParticipants')
      }
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          error={error || Boolean(loadError)}
          helperText={loadError ? translate('portalUx.participantSelect.unavailableHelp') : helperText}
        />
      )}
    />
  )
}
