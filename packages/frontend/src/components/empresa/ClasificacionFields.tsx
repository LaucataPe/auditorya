import { useState } from 'react'
import { CIIU_CATALOGO, SECTORES, SECTOR_LABEL, sectorDesdeCiiu, infoCiiu } from '@auditorya/types'
import { Search, X } from 'lucide-react'
import { Input } from '../ui/Input'
import { Select } from '../ui/Select'

export type Clasificacion = { ciiu: string; actividadEconomica: string; sector: string }

const norm = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

function sectorDeCodigo(codigo: string): string {
  const s = sectorDesdeCiiu(codigo)
  return s ? SECTOR_LABEL[s] : ''
}

export function ClasificacionFields({
  value,
  onChange,
  disabled,
}: {
  value: Clasificacion
  onChange: (patch: Partial<Clasificacion>) => void
  disabled?: boolean
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)

  const q = norm(query.trim())
  const matches =
    q.length === 0
      ? []
      : CIIU_CATALOGO.filter((a) => a.codigo.startsWith(query.trim()) || norm(a.descripcion).includes(q)).slice(0, 12)
  const esCodigo = /^\d{2,}$/.test(query.trim())

  function seleccionar(codigo: string, descripcion: string) {
    onChange({ ciiu: codigo, actividadEconomica: descripcion, sector: sectorDeCodigo(codigo) || value.sector })
    setQuery('')
    setOpen(false)
  }

  const info = value.ciiu ? infoCiiu(value.ciiu) : null

  return (
    <div className="space-y-3">
      {/* Buscador de actividad económica (CIIU) */}
      {!disabled && (
        <div className="relative">
          <label className="text-sm font-medium text-gray-700">Actividad económica (CIIU)</label>
          <div className="relative mt-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Busca por nombre o código (ej: comercio, 4719)"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
              onFocus={() => setOpen(true)}
              onBlur={() => setTimeout(() => setOpen(false), 150)}
              className="w-full rounded-lg border border-gray-300 pl-9 pr-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          {open && (matches.length > 0 || esCodigo) && (
            <div className="absolute z-20 mt-1 w-full max-h-64 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
              {esCodigo && !CIIU_CATALOGO.some((a) => a.codigo === query.trim()) && (
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => seleccionar(query.trim(), value.actividadEconomica || '')}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-indigo-50 border-b border-gray-50"
                >
                  Usar código <span className="font-medium">{query.trim()}</span>
                  {sectorDeCodigo(query.trim()) && <span className="text-xs text-gray-400"> · {sectorDeCodigo(query.trim())}</span>}
                </button>
              )}
              {matches.map((a) => (
                <button
                  key={a.codigo}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => seleccionar(a.codigo, a.descripcion)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-indigo-50"
                >
                  <span className="text-xs text-gray-400 mr-2">{a.codigo}</span>
                  {a.descripcion}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Selección actual */}
      {value.ciiu ? (
        <div className="flex items-start gap-2 rounded-lg bg-gray-50 border border-gray-100 px-3 py-2">
          <div className="min-w-0 flex-1">
            <p className="text-sm text-gray-800">
              <span className="text-xs text-gray-400 mr-1.5">CIIU {value.ciiu}</span>
              {value.actividadEconomica || (info?.descripcion ?? '')}
            </p>
            {info && <p className="text-xs text-emerald-600 mt-0.5">Sección {info.seccion} · {info.descripcion}</p>}
          </div>
          {!disabled && (
            <button type="button" onClick={() => onChange({ ciiu: '', actividadEconomica: '' })}
              className="text-gray-300 hover:text-red-500 shrink-0" title="Quitar">
              <X size={14} />
            </button>
          )}
        </div>
      ) : (
        <Input
          id="clasif-actividad"
          label="Actividad económica"
          placeholder="Descripción de la actividad (o usa el buscador CIIU)"
          value={value.actividadEconomica}
          disabled={disabled}
          onChange={(e) => onChange({ actividadEconomica: e.target.value })}
        />
      )}

      {/* Sector (select controlado) */}
      <Select
        id="clasif-sector"
        label="Sector económico"
        value={SECTORES.includes(value.sector) ? value.sector : ''}
        disabled={disabled}
        onChange={(e) => onChange({ sector: e.target.value })}
        options={[{ value: '', label: 'Selecciona…' }, ...SECTORES.map((s) => ({ value: s, label: s }))]}
      />
    </div>
  )
}
