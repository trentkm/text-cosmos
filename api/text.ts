export const config = { runtime: 'edge' }

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const bookUrl = url.searchParams.get('url')

  if (!bookUrl) {
    return new Response('Missing url param', { status: 400 })
  }

  // Only allow Gutenberg URLs
  if (!bookUrl.startsWith('https://www.gutenberg.org/')) {
    return new Response('Only Gutenberg URLs allowed', { status: 403 })
  }

  try {
    const res = await fetch(bookUrl, { redirect: 'follow' })
    const text = await res.text()

    return new Response(text, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=86400',
      },
    })
  } catch {
    return new Response('Failed to fetch', { status: 502 })
  }
}
