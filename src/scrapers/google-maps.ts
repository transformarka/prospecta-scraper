export interface EmpresaGoogleMaps {
  nombre:               string
  telefono?:            string
  web?:                 string
  direccion?:           string
  rating?:              string
  reseñas?:             string
  categoria?:           string
  horario?:             string   // FIX 2
  señales_encontradas?: string   // heurística para angulo_mensaje
}

interface TextSearchPlace {
  place_id:            string
  name:                string
  formatted_address?:  string
  rating?:             number
  user_ratings_total?: number
  types?:              string[]
}

interface PlaceDetails {
  formatted_phone_number?: string
  website?:                string
  types?:                  string[]
  opening_hours?:          { weekday_text?: string[] }
}

// Genera señales de oportunidad a partir de los datos reales.
function calcularSeñales(e: EmpresaGoogleMaps): string | undefined {
  const s: string[] = []
  const nReseñas = Number(e.reseñas ?? 0)
  const rating   = Number(e.rating ?? 0)
  if (rating >= 4.5 && nReseñas > 100) s.push(`alta reputación (${e.rating}★, ${nReseñas} reseñas)`)
  if (!e.web)      s.push('sin web propia — oportunidad de presencia digital')
  if (!e.telefono) s.push('sin teléfono público')
  return s.length ? s.join('; ') : undefined
}

export async function scrapeGoogleMaps(
  query:  string,
  ciudad: string,
): Promise<EmpresaGoogleMaps[]> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY
  if (!apiKey) throw new Error('GOOGLE_PLACES_API_KEY no configurado en Railway')

  // 1. Text Search — hasta 20 resultados
  const searchParams = new URLSearchParams({
    query:    `${query} ${ciudad}`,
    key:      apiKey,
    language: 'es',
  })
  const searchRes  = await fetch(
    `https://maps.googleapis.com/maps/api/place/textsearch/json?${searchParams}`,
  )
  const searchData = await searchRes.json() as {
    results: TextSearchPlace[]
    status:  string
  }
  if (searchData.status !== 'OK' && searchData.status !== 'ZERO_RESULTS') {
    throw new Error(`Google Places Text Search error: ${searchData.status}`)
  }

  const lugares  = searchData.results ?? []
  const empresas: EmpresaGoogleMaps[] = []

  // 2. Place Details + enriquecimiento por cada empresa
  for (const lugar of lugares) {
    const empresa: EmpresaGoogleMaps = {
      nombre:    lugar.name,
      direccion: lugar.formatted_address,
      rating:    lugar.rating?.toString(),
      reseñas:   lugar.user_ratings_total?.toString(),
    }

    // FIX 2 — Place Details: teléfono, web, tipo real y horario
    try {
      const detailsParams = new URLSearchParams({
        place_id: lugar.place_id,
        fields:   'formatted_phone_number,website,types,opening_hours',
        key:      apiKey,
        language: 'es',
      })
      const detailsRes  = await fetch(
        `https://maps.googleapis.com/maps/api/place/details/json?${detailsParams}`,
      )
      const detailsData = await detailsRes.json() as { result?: PlaceDetails; status: string }
      if (detailsData.status === 'OK' && detailsData.result) {
        const r = detailsData.result
        empresa.telefono  = r.formatted_phone_number
        empresa.web       = r.website
        empresa.categoria = r.types?.[0]?.replace(/_/g, ' ')
        empresa.horario   = r.opening_hours?.weekday_text?.join(' | ')
      }
    } catch { /* continúa sin detalles si falla */ }

    // Fallback de categoría desde el Text Search si Details no la dio
    if (!empresa.categoria) empresa.categoria = lugar.types?.[0]?.replace(/_/g, ' ')

    // Señales heurísticas para angulo_mensaje
    empresa.señales_encontradas = calcularSeñales(empresa)

    empresas.push(empresa)
  }

  return empresas
}
