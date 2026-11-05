import { Plus } from 'lucide-react'

/**
 * Preguntas frecuentes con `<details>`/`<summary>` nativos: accesibles por teclado y
 * lectores de pantalla sin JavaScript extra. Se pueden abrir varias a la vez.
 */
export function FAQAccordion({ preguntas }: { preguntas: { pregunta: string; respuesta: string }[] }) {
  return (
    <div className="space-y-2.5">
      {preguntas.map(({ pregunta, respuesta }, i) => (
        <details
          key={pregunta}
          open={i === 0}
          className="group rounded-2xl border border-marca-linea bg-white transition open:border-[#d6c9fa] open:shadow-[0_18px_36px_-26px_rgba(91,33,182,0.6)]"
        >
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-2xl px-5 py-4 font-semibold text-marca-tinta focus:outline-none focus-visible:ring-[3px] focus-visible:ring-marca-300 [&::-webkit-details-marker]:hidden">
            {pregunta}
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-marca-100 text-marca-700 transition group-open:rotate-45 group-open:bg-marca-600 group-open:text-white">
              <Plus className="h-4 w-4" aria-hidden="true" />
            </span>
          </summary>
          <p className="px-5 pb-5 text-[15px] leading-relaxed text-marca-suave">{respuesta}</p>
        </details>
      ))}
    </div>
  )
}
