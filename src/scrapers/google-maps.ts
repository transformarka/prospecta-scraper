import { chromium, Browser } from 'playwright'
import type { EmpresaGoogleMaps } from '../types'

export async function scrapeGoogleMaps(
  query: string,
  ciudad: string,
): Promise<EmpresaGoogleMaps[]> {
  let browser: Browser | null = null

  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    })

    const context = await browser.newContext({
      locale:    'es-ES',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    })

    const page = await context.newPage()

    const searchTerm = `${query} ${ciudad}`
    await page.goto(
      `https://www.google.com/maps/search/${encodeURIComponent(searchTerm)}`,
      { waitUntil: 'networkidle', timeout: 30000 },
    )

    // Aceptar cookies si aparece
    try {
      const cookieBtn = page.locator('button').filter({ hasText: /Aceptar todo|Accept all/i }).first()
      if (await cookieBtn.isVisible({ timeout: 3000 })) await cookieBtn.click()
    } catch { /* sin banner */ }

    // Esperar el panel de resultados
    await page.waitForSelector('div[role="feed"]', { timeout: 20000 })

    // Scroll para cargar todos los resultados disponibles
    const feed = page.locator('div[role="feed"]')
    let prevCount = 0
    for (let i = 0; i < 10; i++) {
      await feed.evaluate(el => el.scrollBy(0, 1000))
      await page.waitForTimeout(800)
      const count = await page.locator('div[role="feed"] > div[jsaction]').count()
      if (count === prevCount) break // no hay más resultados
      prevCount = count
    }

    // Extraer datos directamente del listado (sin clic por empresa — más rápido)
    const empresas: EmpresaGoogleMaps[] = []
    const items = page.locator('div[role="feed"] > div[jsaction]')
    const total = await items.count()

    for (let i = 0; i < total; i++) {
      try {
        const item = items.nth(i)

        // Nombre
        const nombre = await item.locator('.fontHeadlineSmall, .qBF1Pd').first().textContent().catch(() => null)
        if (!nombre?.trim()) continue

        // Rating y reseñas del listado
        const rating  = await item.locator('span.MW4etd').first().textContent().catch(() => null)
        const reseñas = await item.locator('span.UY7F9').first().textContent().catch(() => null)

        // Categoría y dirección en el listado
        const metaItems = await item.locator('div.W4Efsd > div.W4Efsd span').allTextContents().catch(() => [] as string[])
        const categoria = metaItems[0]?.trim() || undefined
        const direccion = metaItems.find(t => t.includes(',') || t.match(/calle|av\.|plaza|paseo/i))?.trim()

        // Teléfono (a veces aparece en el listado)
        const telefono = metaItems.find(t => t.match(/^\+?[\d\s\-().]{7,}$/))?.trim()

        // Web (a veces aparece en el listado)
        const webHref = await item.locator('a[data-value="Sitio web"]').getAttribute('href').catch(() => null)

        empresas.push({
          nombre:    nombre.trim(),
          telefono:  telefono ?? undefined,
          web:       webHref ?? undefined,
          direccion: direccion ?? undefined,
          rating:    rating?.trim() ?? undefined,
          reseñas:   reseñas?.replace(/[()]/g, '').trim() ?? undefined,
          categoria: categoria ?? undefined,
        })
      } catch {
        // Continuar con el siguiente
      }
    }

    return empresas
  } finally {
    if (browser) await browser.close()
  }
}
