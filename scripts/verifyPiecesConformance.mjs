import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import zlib from 'node:zlib'

// --- PNG decode (RGBA, 8-bit, colorType 6) ---
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
const readUInt32BE = (buf, off) => buf.readUInt32BE(off)

function paethPredictor(a, b, c) {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  if (pa <= pb && pa <= pc) return a
  if (pb <= pc) return b
  return c
}

function decodePngToRgba(filePath) {
  const bytes = fs.readFileSync(filePath)
  if (bytes.length < 8 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error('Not a PNG file')

  let offset = 8
  let width = 0
  let height = 0
  let bitDepth = 0
  let colorType = 0
  const idatParts = []

  while (offset + 8 <= bytes.length) {
    const len = readUInt32BE(bytes, offset)
    const type = bytes.subarray(offset + 4, offset + 8).toString('ascii')
    const dataStart = offset + 8
    const dataEnd = dataStart + len
    if (dataEnd + 4 > bytes.length) break
    const data = bytes.subarray(dataStart, dataEnd)

    if (type === 'IHDR') {
      width = readUInt32BE(data, 0)
      height = readUInt32BE(data, 4)
      bitDepth = data[8]
      colorType = data[9]
    } else if (type === 'IDAT') {
      idatParts.push(data)
    } else if (type === 'IEND') {
      break
    }
    offset = dataEnd + 4 // CRC
  }

  if (!width || !height) throw new Error('Missing IHDR')
  if (bitDepth !== 8) throw new Error(`Unsupported bitDepth ${bitDepth}`)
  if (colorType !== 6) throw new Error(`Unsupported colorType ${colorType} (expected 6=RGBA)`)

  const compressed = Buffer.concat(idatParts)
  const inflated = zlib.inflateSync(compressed)

  const bpp = 4
  const stride = width * bpp
  const expectedLen = height * (1 + stride)
  if (inflated.length < expectedLen) throw new Error(`Inflated data too small: ${inflated.length} < ${expectedLen}`)

  const out = Buffer.allocUnsafe(width * height * bpp)
  const prevRow = Buffer.alloc(stride)
  const curRow = Buffer.alloc(stride)

  let inOff = 0
  let outOff = 0
  for (let y = 0; y < height; y++) {
    const filter = inflated[inOff++]
    inflated.copy(curRow, 0, inOff, inOff + stride)
    inOff += stride

    if (filter === 0) {
      // none
    } else if (filter === 1) {
      for (let i = 0; i < stride; i++) {
        const left = i >= bpp ? curRow[i - bpp] : 0
        curRow[i] = (curRow[i] + left) & 0xff
      }
    } else if (filter === 2) {
      for (let i = 0; i < stride; i++) curRow[i] = (curRow[i] + prevRow[i]) & 0xff
    } else if (filter === 3) {
      for (let i = 0; i < stride; i++) {
        const left = i >= bpp ? curRow[i - bpp] : 0
        const up = prevRow[i]
        curRow[i] = (curRow[i] + Math.floor((left + up) / 2)) & 0xff
      }
    } else if (filter === 4) {
      for (let i = 0; i < stride; i++) {
        const left = i >= bpp ? curRow[i - bpp] : 0
        const up = prevRow[i]
        const upLeft = i >= bpp ? prevRow[i - bpp] : 0
        curRow[i] = (curRow[i] + paethPredictor(left, up, upLeft)) & 0xff
      }
    } else {
      throw new Error(`Unsupported filter type ${filter}`)
    }

    curRow.copy(out, outOff, 0, stride)
    outOff += stride
    curRow.copy(prevRow, 0, 0, stride)
  }

  return { width, height, data: new Uint8Array(out) }
}

// --- Piece extraction (same heuristic as original) ---
const isDark = (r, g, b) => r < 50 && g < 50 && b < 50
const isGreen = (r, g, b) => g > 140 && r < 120 && b < 120

const groupConsecutive = (positions) => {
  const grouped = []
  let i = 0
  while (i < positions.length) {
    let j = i
    while (j + 1 < positions.length && positions[j + 1] === positions[j] + 1) j++
    grouped.push(Math.round((positions[i] + positions[j]) / 2))
    i = j + 1
  }
  return grouped
}

const detectGridLines = (img) => {
  const { width, height, data } = img
  const darkCountX = new Array(width).fill(0)
  const darkCountY = new Array(height).fill(0)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]
      const a = data[i + 3]
      if (a > 10 && isDark(r, g, b)) {
        darkCountX[x]++
        darkCountY[y]++
      }
    }
  }
  const xLinesRaw = []
  const yLinesRaw = []
  const xThreshold = Math.floor(height * 0.25)
  const yThreshold = Math.floor(width * 0.25)
  for (let x = 0; x < width; x++) if (darkCountX[x] >= xThreshold) xLinesRaw.push(x)
  for (let y = 0; y < height; y++) if (darkCountY[y] >= yThreshold) yLinesRaw.push(y)
  return { xs: groupConsecutive(xLinesRaw), ys: groupConsecutive(yLinesRaw) }
}

const sampleCellGreen = (img, x0, x1, y0, y1) => {
  const { width, data } = img
  const cx = Math.floor((x0 + x1) / 2)
  const cy = Math.floor((y0 + y1) / 2)
  let green = 0
  let total = 0
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const x = cx + dx
      const y = cy + dy
      if (x < 0 || y < 0 || x >= img.width || y >= img.height) continue
      const i = (y * width + x) * 4
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]
      const a = data[i + 3]
      if (a <= 10) continue
      total++
      if (isGreen(r, g, b)) green++
    }
  }
  return total > 0 && green / total > 0.25
}

const normalizeCells = (cells) => {
  const minRow = Math.min(...cells.map((c) => c.row))
  const minCol = Math.min(...cells.map((c) => c.col))
  const normalized = cells.map((c) => ({ row: c.row - minRow, col: c.col - minCol }))
  normalized.sort((a, b) => (a.row - b.row) || (a.col - b.col))
  return normalized
}

function extractPiecesFromPng(img) {
  const { xs, ys } = detectGridLines(img)
  if (xs.length < 2 || ys.length < 2) throw new Error('Unable to detect grid lines')
  const cols = xs.length - 1
  const rows = ys.length - 1

  const occupied = Array.from({ length: rows }, () => Array.from({ length: cols }, () => false))
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x0 = xs[c] + 1
      const x1 = xs[c + 1] - 1
      const y0 = ys[r] + 1
      const y1 = ys[r + 1] - 1
      occupied[r][c] = sampleCellGreen(img, x0, x1, y0, y1)
    }
  }

  const visited = Array.from({ length: rows }, () => Array.from({ length: cols }, () => false))
  const dirs = [
    { row: -1, col: 0 },
    { row: 1, col: 0 },
    { row: 0, col: -1 },
    { row: 0, col: 1 },
  ]
  const components = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!occupied[r][c] || visited[r][c]) continue
      const queue = [{ row: r, col: c }]
      visited[r][c] = true
      const cells = []
      while (queue.length) {
        const cur = queue.shift()
        cells.push({ row: cur.row, col: cur.col })
        for (const d of dirs) {
          const nr = cur.row + d.row
          const nc = cur.col + d.col
          if (nr < 0 || nc < 0 || nr >= rows || nc >= cols) continue
          if (visited[nr][nc] || !occupied[nr][nc]) continue
          visited[nr][nc] = true
          queue.push({ row: nr, col: nc })
        }
      }
      const normalized = normalizeCells(cells)
      if (normalized.length) components.push(normalized)
    }
  }

  const serialize = (cells) => cells.map((c) => `${c.row},${c.col}`).join(';')
  components.sort((a, b) => {
    const d = b.length - a.length
    if (d) return d
    return serialize(a).localeCompare(serialize(b))
  })

  return components.map((cells, i) => ({
    id: String.fromCharCode('A'.charCodeAt(0) + i),
    cells,
  }))
}

// --- Load PUZZLE_PIECES from TS file by evaluating only the array literal ---
function loadPuzzlePiecesFromTs(filePath) {
  const src = fs.readFileSync(filePath, 'utf8')
  const marker = 'export const PUZZLE_PIECES'
  const idx = src.indexOf(marker)
  if (idx < 0) throw new Error('PUZZLE_PIECES not found')

  const eq = src.indexOf('=', idx)
  if (eq < 0) throw new Error('Could not find "=" for PUZZLE_PIECES assignment')

  // Important: avoid picking up the brackets in the type annotation (e.g. PieceDef[]).
  const startBracket = src.indexOf('[', eq)
  if (startBracket < 0) throw new Error('Could not find opening [ for PUZZLE_PIECES')

  // bracket matching for [...]
  let depth = 0
  let end = -1
  for (let i = startBracket; i < src.length; i++) {
    const ch = src[i]
    if (ch === '[') depth++
    else if (ch === ']') {
      depth--
      if (depth === 0) {
        end = i
        break
      }
    }
  }
  if (end < 0) throw new Error('Could not find closing ] for PUZZLE_PIECES')

  const arrayLiteral = src.slice(startBracket, end + 1)
  const context = vm.createContext({})
  const script = new vm.Script(`(${arrayLiteral})`)
  const value = script.runInContext(context, { timeout: 2000 })
  if (!Array.isArray(value)) throw new Error('PUZZLE_PIECES did not evaluate to an array')

  return value.map((p) => ({ id: p.id, cells: normalizeCells(p.cells || []) }))
}

const toKey = (cells) => cells.map((c) => `${c.row},${c.col}`).join(';')

function main() {
  const repoRoot = process.cwd()
  const pngPath = path.join(repoRoot, 'src', 'assets', 'pieces.png')
  const tsPath = path.join(repoRoot, 'src', 'data', 'pieces.ts')

  const img = decodePngToRgba(pngPath)
  const extracted = extractPiecesFromPng(img)
  const hardcoded = loadPuzzlePiecesFromTs(tsPath)

  const extractedById = new Map(extracted.map((p) => [p.id, p]))
  const hardcodedById = new Map(hardcoded.map((p) => [p.id, p]))

  const ids = 'ABCDEFGHIJ'.split('')
  const diffs = []

  for (const id of ids) {
    const e = extractedById.get(id)
    const h = hardcodedById.get(id)
    if (!e || !h) {
      diffs.push({ id, reason: 'missing', extracted: !!e, hardcoded: !!h })
      continue
    }
    const ek = toKey(e.cells)
    const hk = toKey(h.cells)
    if (ek !== hk) {
      diffs.push({ id, reason: 'cells_mismatch', extracted: ek, hardcoded: hk })
    }
  }

  if (diffs.length === 0) {
    console.log('OK: PUZZLE_PIECES matches pieces.png for all pieces A-J')
    process.exit(0)
  }

  console.log('MISMATCHES:')
  console.log(JSON.stringify(diffs, null, 2))
  process.exit(1)
}

main()


