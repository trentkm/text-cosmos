import { defineConfig, type Plugin } from 'vite'

function gutenbergProxy(): Plugin {
  return {
    name: 'gutenberg-proxy',
    configureServer(server) {
      server.middlewares.use('/api/text', async (req, res) => {
        const url = new URL(req.url ?? '', 'http://localhost')
        const bookUrl = url.searchParams.get('url')

        if (!bookUrl || !bookUrl.startsWith('https://www.gutenberg.org/')) {
          res.writeHead(400)
          res.end('Invalid URL')
          return
        }

        try {
          const response = await fetch(bookUrl, { redirect: 'follow' })
          const text = await response.text()
          res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' })
          res.end(text)
        } catch {
          res.writeHead(502)
          res.end('Failed to fetch')
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [gutenbergProxy()],
})
