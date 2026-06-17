// Minimal, dependency-free Markdown renderer for our legal docs.
// Handles: # / ## / ### headings, --- rules, - bullet lists, **bold**, and paragraphs.
import React from 'react'

function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  // Split on **bold** segments
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.filter(Boolean).map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**')) {
      return <strong key={`${keyPrefix}-b${i}`}>{p.slice(2, -2)}</strong>
    }
    return <React.Fragment key={`${keyPrefix}-t${i}`}>{p}</React.Fragment>
  })
}

export default function MarkdownDoc({ content }: { content: string }) {
  const lines = content.split('\n')
  const blocks: React.ReactNode[] = []
  let list: string[] = []
  let key = 0

  const flushList = () => {
    if (list.length === 0) return
    const items = [...list]
    blocks.push(
      <ul key={`ul${key++}`} style={{ margin: '8px 0 16px', paddingLeft: 22, color: '#3D3B34', lineHeight: 1.7 }}>
        {items.map((li, i) => <li key={i} style={{ marginBottom: 4 }}>{renderInline(li, `li${key}-${i}`)}</li>)}
      </ul>
    )
    list = []
  }

  for (const raw of lines) {
    const line = raw.trimEnd()
    if (line.startsWith('### ')) { flushList(); blocks.push(<h3 key={key++} style={{ fontSize: 16, fontWeight: 600, color: '#15161B', margin: '20px 0 8px' }}>{renderInline(line.slice(4), `h3${key}`)}</h3>) }
    else if (line.startsWith('## ')) { flushList(); blocks.push(<h2 key={key++} style={{ fontSize: 20, fontWeight: 700, color: '#15161B', margin: '28px 0 10px' }}>{renderInline(line.slice(3), `h2${key}`)}</h2>) }
    else if (line.startsWith('# ')) { flushList(); blocks.push(<h1 key={key++} style={{ fontSize: 30, fontWeight: 700, color: '#15161B', margin: '0 0 12px', letterSpacing: '-0.02em' }}>{renderInline(line.slice(2), `h1${key}`)}</h1>) }
    else if (line === '---') { flushList(); blocks.push(<hr key={key++} style={{ border: 'none', borderTop: '1px solid #E8E5DF', margin: '24px 0' }} />) }
    else if (line.startsWith('- ')) { list.push(line.slice(2)) }
    else if (line.trim() === '') { flushList() }
    else { flushList(); blocks.push(<p key={key++} style={{ fontSize: 14, color: '#3D3B34', lineHeight: 1.7, margin: '0 0 12px' }}>{renderInline(line, `p${key}`)}</p>) }
  }
  flushList()

  return <>{blocks}</>
}
