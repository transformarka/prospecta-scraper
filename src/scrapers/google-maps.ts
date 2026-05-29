export interface EmpresaGoogleMaps {
  nombre:     string
  telefono?:  string
  web?:       string
  direccion?: string
  rating?:    string
  reseñas?:   string
  categoria?: string
}

interface TextSearchPlace {
  place_id:            string
  name:                string
  formatted_address?:  string
  rating?:             number
  user_ratings_total?: number
  types?:              string[]
}

export async function scrapeGoogleMaps(
  query:  string,
  ciudad: string,
): Promise<EmpresaGoogleMaps[]> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY
  if (!apiKey) throw new Error('GOOGLE_PLACES_API_KEY no configurado en Railway')

  // 1. Text Search — hasta 20 resultados por página
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

  // 2. Place Details por cada resultado para obtener teléfono + web
  for (const lugar of lugares) {
    const empresa: EmpresaGoogleMaps = {
      nombre:    lugar.name,
      direccion: lugar.formatted_address,
      rating:    lugar.rating?.toString(),
      reseñas:   lugar.user_ratings_total?.toString(),
      categoria: lugar.types?.[0]?.replace(/_/g, ' '),
    }

    try {
      const detailsParams = new URLSearchParams({
        place_id: lugar.place_id,
        fields:   'formatted_phone_number,website',
        key:      apiKey,
        language: 'es',
      })
      const detailsRes  = await fetch(
        `https://maps.googleapis.com/maps/api/place/details/json?${detailsParams}`,
      )
      const detailsData = await detailsRes.json() as {
        result?: { formatted_phone_number?: string; website?: string }
        status:  string
      }
      if (detailsData.status === 'OK' && detailsData.result) {
        empresa.telefono = detailsData.result.formatted_phone_number
        empresa.web      = detailsData.result.website
      }
    } catch { /* continúa sin detalles si falla una llamada individual */ }

    empresas.push(empresa)
  }

  return empresas
}
