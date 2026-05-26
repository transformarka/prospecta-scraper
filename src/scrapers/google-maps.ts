import { chromium, Browser } from 'playwright'
import type { EmpresaGoogleMaps } from '../types'

export async function scrapeGoogleMaps(
  query: string,
  ciudad: string,
  cantidad: number,
): Promise<EmpresaGoogleMaps[]> {
  let browser: Browser | null = null

  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    })

    const context = await browser.newContext({
      locale: 'es-ES',
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    })

    const page = await context.newPage()

    const searchTerm = `${query} ${ciudad}`
    await page.goto(
      `https://www.google.com/maps/search/${encodeURIComponent(searchTerm)}`,
      { waitUntil: 'networkidle', timeout: 30000 },
    )

    // Aceptar cookies si aparece el banner
    try {
      const cookieBtn = page.locator('button').filter({ hasText: /Aceptar todo|Accept all/i }).first()
      if (await cookieBtn.isVisible({ timeout: 3000 })) await cookieBtn.click()
    } catch { /* sin banner */ }

    // Esperar el panel de resultados
    await page.waitForSelector('div[role="feed"]', { timeout: 20000 })

    // Scroll para cargar más resultados
    const feed = page.locator('div[role="feed"]')
    for (let i = 0; i < 4; i++) {
      await feed.evaluate(el => el.scrollBy(0, 600))
      await page.waitForTimeout(600)
    }

    // Obtener los elementos de resultado del panel lateral
    const resultados = page.locator('div[role="feed"] > div[jsaction]')
    const total = await resultados.count()
    const empresas: EmpresaGoogleMaps[] = []

    for (let i = 0; i < Math.min(total, cantidad); i++) {
      try {
        const item = resultados.nth(i)

        // Clic para abrir el panel de detalle
        await item.click()
        await page.waitForTimeout(1800)

        // Extraer datos del panel de detalle
        const nombre = await page
          .locator('h1.DUwDvf, h1.fontHeadlineLarge')
          .first()
          .textContent()
          .catch(() => null)

        if (!nombre?.trim()) continue

        // Teléfono
        const telefonoLabel = await page
          .locator('button[data-item-id*="phone"]')
          .getAttribute('aria-label')
          .catch(() => null)
        const telefono = telefonoLabel
          ? telefonoLabel.replace(/^Teléfono:\s*/i, '').trim()
          : undefined

        // Web
        const web = await page
          .locator('a[data-item-id="authority"]')
          .getAttribute('href')
          .catch(() => null)

        // Dirección
        const direccionLabel = await page
          .locator('button[data-item-id="address"]')
          .getAttribute('aria-label')
          .catch(() => null)
        const direccion = direccionLabel
          ? direccionLabel.replace(/^Dirección:\s*/i, '').trim()
          : undefined

        // Rating
        const rating = await page
          .locator('div.fontDisplayLarge')
          .first()
          .textContent()
          .catch(() => null)

        // Reseñas
        const reseñasText = await page
          .locator('button[jsaction*="pane.reviewChart"]')
          .first()
          .textContent()
          .catch(() => null)
        const reseñas = reseñasText?.match(/[\d.,]+/)?.[0]

        // Categoría
        const categoria = await page
          .locator('button.DkEaL, span.mgr77e')
          .first()
          .textContent()
          .catch(() => null)

        empresas.push({
          nombre:    nombre.trim(),
          telefono,
          web:       web ?? undefined,
          direccion,
          rating:    rating?.trim() ?? undefined,
          reseñas:   reseñas ?? undefined,
          categoria: categoria?.trim() ?? undefined,
        })
      } catch {
        // Continuar con el siguiente si hay error en uno
      }
    }

    return empresas
  } finally {
    if (browser) await browser.close()
  }
}
