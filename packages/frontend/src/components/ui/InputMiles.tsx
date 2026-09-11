import { useEffect, useRef, useState, type InputHTMLAttributes } from 'react'

/**
 * Input numérico con separador de miles es-CO (1.234.567) mientras se escribe.
 * Mantiene su propio texto y entrega el número por onValor al perder el foco
 * (mismo patrón onBlur del resto de formularios). Solo enteros, admite negativos.
 */
type Props = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'value' | 'defaultValue' | 'onChange' | 'onBlur' | 'type'
> & {
  valor: number | null
  onValor: (valor: number | null) => void
}

function aTexto(valor: number | null): string {
  return valor === null ? '' : Math.round(valor).toLocaleString('es-CO')
}

function formatear(entrada: string): string {
  const negativo = entrada.trimStart().startsWith('-')
  const digitos = entrada.replace(/\D/g, '')
  if (!digitos) return negativo ? '-' : ''
  return (negativo ? '-' : '') + Number(digitos).toLocaleString('es-CO')
}

export function parseMiles(texto: string): number | null {
  const limpio = texto.replace(/[^\d-]/g, '')
  if (!limpio || limpio === '-') return null
  return Number(limpio)
}

export function InputMiles({ valor, onValor, ...props }: Props) {
  const ref = useRef<HTMLInputElement>(null)
  const [texto, setTexto] = useState(aTexto(valor))

  // Sincroniza si el valor cambia desde afuera, sin pisar lo que se está escribiendo.
  useEffect(() => {
    if (document.activeElement !== ref.current) setTexto(aTexto(valor))
  }, [valor])

  return (
    <input
      ref={ref}
      type="text"
      inputMode="numeric"
      value={texto}
      onChange={(e) => setTexto(formatear(e.target.value))}
      onBlur={() => onValor(parseMiles(texto))}
      {...props}
    />
  )
}
