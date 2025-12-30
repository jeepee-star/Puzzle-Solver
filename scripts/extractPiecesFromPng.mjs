import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

function readUInt32BE(buf, off) {
  return buf.readUInt32BE(off)
}

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
  if (bytes.length < 8 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error('Not a PNG file')
  }

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

    offset = dataEnd + 4 // skip CRC
  }

  if (!width || !height) throw new Error('Missing IHDR')
  if (bitDepth !== 8) throw new Error(`Unsupported bitDepth ${bitDepth}`)
  if (colorType !== 6) throw new Error(`Unsupported colorType ${colorType} (expected 6=RGBA)`)

  const compressed = Buffer.concat(idatParts)
  const inflated = zlib.inflateSync(compressed)

  const bytesPerPixel = 4
  const stride = width * bytesPerPixel
  const expectedLen = height * (1 + stride)
  if (inflated.length < expectedLen) {
    throw new Error(`Inflated data too small: ${inflated.length} < ${expectedLen}`)
  }

  const out = Buffer.allocUnsafe(width * height * bytesPerPixel)
  let inOff = 0
  let outOff = 0

  const prevRow = Buffer.alloc(stride)
  const curRow = Buffer.alloc(stride)

  for (let y = 0; y < height; y++) {
    const filter = inflated[inOff]
    inOff += 1
    inflated.copy(curRow, 0, inOff, inOff + stride)
    inOff += stride

    if (filter === 0) {
      // none
    } else if (filter === 1) {
      // sub
      for (let i = 0; i < stride; i++) {
        const left = i >= bytesPerPixel ? curRow[i - bytesPerPixel] : 0
        curRow[i] = (curRow[i] + left) & 0xff
      }
    } else if (filter === 2) {
      // up
      for (let i = 0; i < stride; i++) {
        curRow[i] = (curRow[i] + prevRow[i]) & 0xff
      }
    } else if (filter === 3) {
      // average
      for (let i = 0; i < stride; i++) {
        const left = i >= bytesPerPixel ? curRow[i - bytesPerPixel] : 0
        const up = prevRow[i]
        curRow[i] = (curRow[i] + Math.floor((left + up) / 2)) & 0xff
      }
    } else if (filter === 4) {
      // paeth
      for (let i = 0; i < stride; i++) {
        const left = i >= bytesPerPixel ? curRow[i - bytesPerPixel] : 0
        const up = prevRow[i]
        const upLeft = i >= bytesPerPixel ? prevRow[i - bytesPerPixel] : 0
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

function extractPieces(img) {
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
  const pieces = []
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
      if (normalized.length) pieces.push({ cells: normalized })
    }
  }
  // deterministic ordering: by size desc, then serialized cells
  const serialize = (cells) => cells.map((c) => `${c.row},${c.col}`).join(';')
  pieces.sort((a, b) => {
    const d = b.cells.length - a.cells.length
    if (d) return d
    return serialize(a.cells).localeCompare(serialize(b.cells))
  })
  return pieces
}

const repoRoot = process.cwd()
const pngPath = path.join(repoRoot, 'src', 'assets', 'pieces.png')
const img = decodePngToRgba(pngPath)
const pieces = extractPieces(img)

console.log(
  JSON.stringify(
    pieces.map((p, i) => ({
      id: String.fromCharCode('A'.charCodeAt(0) + i),
      cells: p.cells,
    })),
    null,
    2,
  ),
)


