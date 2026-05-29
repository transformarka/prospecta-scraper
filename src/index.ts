import express from 'express'

// CRITICAL: register BEFORE any require() that might fail
// Static imports (like express above) are compiled first, but express is safe.
// playwright is loaded dynamically below so errors are caught here.
process.on('uncaughtException', (err) => {
  console.error('[CRASH] uncaughtException:', err.message, err.stack)
  process.exit(1)
})
process.on('unhandledRejection', (reason) => {
  console.error('[CRASH] unhandledRejection:', reason)
  process.exit(1)
})

const PORT         = Number(process.env.PORT ?? 3000)
const API_KEY      = process.env.SCRAPER_API_KEY ?? ''
const SUPABASE_URL = process.env.SUPABASE_URL ?? ''
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

async function supabaseUpdate(table: string, id: string, data: Record<string, unknown>) {
  const url = `${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`
  await fetch(url, {
    method: 'PATCH',
    headers: {
      'Content-Type':  'application/json',
      'apikey':        SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Prefer':        'return=minimal',
    },
    body: JSON.stringify({ ...data, updated_at: new Date().toISOString() }),
  })
}

async function supabaseInsert(table: string, rows: Record<string, unknown>[]) {
  const url = `${SUPABASE_URL}/rest/v1/${table}`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'apikey':        SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Prefer':        'return=minimal',
    },
    body: JSON.stringify(rows),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Supabase insert error: ${err}`)
  }
}

async function startServer() {
  console.log('[STARTUP] Loading playwright module...')

  // Dynamic require so any load error is caught by unhandledRejection above
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { scrapeGoogleMaps } = require('./scrapers/google-maps') as typeof import('./scrapers/google-maps')

  console.log('[STARTUP] Playwright loaded, starting Express...')

  const app = express()
  app.use(express.json())

  // Auth middleware
  app.use((req, res, next) => {
    if (req.path === '/health') return next()
    const key = req.headers['x-api-key']
    if (!API_KEY || key !== API_KEY) {
      res.status(401).json({ error: 'API key inválida' })
      return
    }
    next()
  })

  app.get('/health', (_req, res) => {
    res.json({ ok: true, service: 'prospecta-scraper' })
  })

  app.post('/google-maps', async (req, res) => {
    const { query, ciudad, pais, workspace_id, search_id } = req.body as {
      query:        string
      ciudad:       string
      pais:         string
      workspace_id: string
      search_id:    string
    }

    if (!query || !ciudad || !workspace_id || !search_id) {
      return void res.status(400).json({ error: 'query, ciudad, workspace_id y search_id son requeridos' })
    }

    res.json({ ok: true, search_id, message: 'Búsqueda iniciada' })

    ;(async () => {
      try {
        console.log(`[google-maps] Iniciando búsqueda: "${query}" en ${ciudad}, ${pais}`)

        await supabaseUpdate('prospect_searches', search_id, { estado: 'buscando' })

        const empresas = await scrapeGoogleMaps(query, ciudad)

        console.log(`[google-maps] Encontradas: ${empresas.length} empresas`)

        if (!empresas.length) {
          await supabaseUpdate('prospect_searches', search_id, {
            estado:        'error',
            error_message: 'No se encontraron empresas para este sector y ciudad',
          })
          return
        }

        const rows = empresas.map((e, i) => ({
          workspace_id,
          nombre:               'Por identificar',
          empresa:              e.nombre,
          cargo:                'Decisor',
          ciudad,
          nivel_encaje:         'Medio',
          nivel_decision:       'Medio',
          motivo_encaje:        `Empresa real encontrada en Google Maps. ${e.rating ? `Rating: ${e.rating}` : ''}${e.reseñas ? ` (${e.reseñas} reseñas)` : ''}`.trim(),
          dolor_visible:        'Por analizar con A6',
          servicio_recomendado: 'Por analizar con A6',
          objecion_probable:    '',
          respuesta_objecion:   '',
          angulo_mensaje:       `${e.nombre}${e.direccion ? ` — ${e.direccion}` : ''}`,
          canal_recomendado:    e.telefono ? 'whatsapp' : 'email',
          fuente:               'web',
          prioridad:            i + 1,
          notas: [
            e.web       && `Web: ${e.web}`,
            e.telefono  && `Tel: ${e.telefono}`,
            e.direccion && `Dir: ${e.direccion}`,
            e.rating    && `Rating: ${e.rating}${e.reseñas ? ` (${e.reseñas} reseñas)` : ''}`,
            e.categoria && `Categoría: ${e.categoria}`,
          ].filter(Boolean).join('\n') || null,
        }))

        await supabaseInsert('prospects', rows)

        await supabaseUpdate('prospect_searches', search_id, {
          estado:                 'completado',
          prospectos_encontrados: empresas.length,
        })

        console.log(`[google-maps] Job completado: ${empresas.length} prospectos insertados`)
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Error desconocido'
        console.error(`[google-maps] Error en job:`, msg)
        await supabaseUpdate('prospect_searches', search_id, {
          estado:        'error',
          error_message: msg,
        }).catch(() => {})
      }
    })()
  })

  app.listen(PORT, () => {
    console.log(`prospecta-scraper corriendo en puerto ${PORT}`)
  })
}

startServer()
