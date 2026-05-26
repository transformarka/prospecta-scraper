import express from 'express'
import { scrapeGoogleMaps } from './scrapers/google-maps'
import type { ScrapeGoogleMapsRequest, ScrapeGoogleMapsResponse, ErrorResponse } from './types'

const app  = express()
const PORT = Number(process.env.PORT ?? 3000)
const API_KEY = process.env.SCRAPER_API_KEY ?? ''

app.use(express.json())

// Auth middleware
app.use((req, res, next) => {
  // Health check no requiere auth
  if (req.path === '/health') return next()

  const key = req.headers['x-api-key']
  if (!API_KEY || key !== API_KEY) {
    res.status(401).json({ error: 'API key inválida' } satisfies ErrorResponse)
    return
  }
  next()
})

// Health check
app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'prospecta-scraper' })
})

// Google Maps scraper
app.post('/google-maps', async (req, res) => {
  const { query, ciudad, cantidad } = req.body as Partial<ScrapeGoogleMapsRequest>

  if (!query || typeof query !== 'string')
    return void res.status(400).json({ error: 'query requerido' } satisfies ErrorResponse)
  if (!ciudad || typeof ciudad !== 'string')
    return void res.status(400).json({ error: 'ciudad requerido' } satisfies ErrorResponse)

  const cantidadNum = Math.min(20, Math.max(1, Number(cantidad) || 5))

  try {
    console.log(`[google-maps] Buscando: "${query}" en ${ciudad} (${cantidadNum} resultados)`)
    const empresas = await scrapeGoogleMaps(query, ciudad, cantidadNum)
    console.log(`[google-maps] Encontradas: ${empresas.length} empresas`)

    const response: ScrapeGoogleMapsResponse = { empresas, total: empresas.length }
    res.json(response)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error desconocido'
    console.error(`[google-maps] Error:`, msg)
    res.status(500).json({ error: msg } satisfies ErrorResponse)
  }
})

app.listen(PORT, () => {
  console.log(`prospecta-scraper corriendo en puerto ${PORT}`)
})
