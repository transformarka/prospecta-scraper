export interface EmpresaGoogleMaps {
  nombre:    string
  telefono?: string
  web?:      string
  direccion?: string
  rating?:   string
  reseñas?:  string
  categoria?: string
}

export interface ScrapeGoogleMapsRequest {
  query:    string
  ciudad:   string
  cantidad: number
}

export interface ScrapeGoogleMapsResponse {
  empresas: EmpresaGoogleMaps[]
  total:    number
}

export interface ErrorResponse {
  error: string
}
