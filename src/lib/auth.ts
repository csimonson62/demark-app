import { NextRequest } from 'next/server'

export function isAuthenticated(request: NextRequest): boolean {
  return request.cookies.get('demark-auth')?.value === 'authenticated'
}
