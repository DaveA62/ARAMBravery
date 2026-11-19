const preloaded = new Map<string, HTMLImageElement>()
const maxImages = 96

export function preloadArcade(urls: Iterable<string | undefined | null>) {
  if (typeof Image === 'undefined') return

  for (const url of urls) {
    if (!url || preloaded.has(url)) continue

    const image = new Image()
    image.decoding = 'async'
    image.onerror = () => {
      if (preloaded.get(url) === image) preloaded.delete(url)
    }
    preloaded.set(url, image)
    image.src = url

    if (preloaded.size > maxImages) {
      const oldest = preloaded.keys().next().value
      if (oldest !== undefined) preloaded.delete(oldest)
    }
  }
}
