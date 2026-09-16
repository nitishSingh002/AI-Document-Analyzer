const stopWords = new Set('a an the and or but if then of in on at to for from by with as is are was were be been being do does did have has had i me my we our you your he she it its they their this that these those what which who whom whose when where why how can could would should will may might must about please tell explain document according'.split(' '))

function keywords(text) {
  return (text.normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}]+/gu) || [])
    .filter(word => !stopWords.has(word))
}

// Word boundaries preserve readable context; overlap retains nearby evidence.
export function splitText(text) {
  const words = text.trim().split(/\s+/u)
  if (!text.trim()) return []
  const chunks = []
  for (let start = 0; start < words.length; start += 180) {
    chunks.push({ chunkIndex: chunks.length, text: words.slice(start, start + 220).join(' ') })
    if (start + 220 >= words.length) break
  }
  return chunks
}

export function retrieveContext(text, question) {
  const terms = [...new Set(keywords(question))]
  if (!terms.length) return []
  const chunks = splitText(text).map(chunk => {
    const frequencies = new Map()
    for (const word of keywords(chunk.text)) frequencies.set(word, (frequencies.get(word) || 0) + 1)
    return { ...chunk, frequencies }
  })
  const weights = new Map(terms.map(term => [term,
    1 + Math.log((chunks.length + 1) / (1 + chunks.filter(chunk => chunk.frequencies.has(term)).length)),
  ]))
  return chunks.map(({ frequencies, ...chunk }) => ({
    ...chunk,
    score: terms.reduce((score, term) => score + (frequencies.has(term)
      ? weights.get(term) * (1 + Math.log(frequencies.get(term))) : 0), 0),
  })).filter(chunk => chunk.score > 0)
    .sort((a, b) => b.score - a.score || a.chunkIndex - b.chunkIndex)
    .slice(0, 4)
    .map(({ chunkIndex, text: context }) => ({ chunkIndex, text: context }))
}
