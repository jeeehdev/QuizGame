// Synthesizes the correct/wrong sound effects into public/sounds/ as small 8-bit mono WAV files.
// Usage: npm run sounds
import { mkdirSync, writeFileSync } from 'node:fs'

const SAMPLE_RATE = 22050

/** notes: [frequencyHz, seconds][]; returns 8-bit unsigned PCM samples with a short fade in/out per note. */
function synth(notes, { volume = 0.35, wave = 'sine' } = {}) {
  const samples = []
  for (const [freq, seconds] of notes) {
    const n = Math.round(seconds * SAMPLE_RATE)
    const fade = Math.round(0.01 * SAMPLE_RATE)
    for (let i = 0; i < n; i++) {
      const phase = (2 * Math.PI * freq * i) / SAMPLE_RATE
      const raw = wave === 'triangle' ? (2 / Math.PI) * Math.asin(Math.sin(phase)) : Math.sin(phase)
      const envelope = Math.min(1, i / fade, (n - i) / fade) * (1 - (0.5 * i) / n)
      samples.push(Math.round(128 + 127 * volume * envelope * raw))
    }
  }
  return Uint8Array.from(samples)
}

function wav(samples) {
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + samples.length, 4)
  header.write('WAVEfmt ', 8)
  header.writeUInt32LE(16, 16) // fmt chunk size
  header.writeUInt16LE(1, 20) // PCM
  header.writeUInt16LE(1, 22) // mono
  header.writeUInt32LE(SAMPLE_RATE, 24)
  header.writeUInt32LE(SAMPLE_RATE, 28) // byte rate
  header.writeUInt16LE(1, 32) // block align
  header.writeUInt16LE(8, 34) // bits per sample
  header.write('data', 36)
  header.writeUInt32LE(samples.length, 40)
  return Buffer.concat([header, Buffer.from(samples)])
}

const dir = new URL('../public/sounds/', import.meta.url)
mkdirSync(dir, { recursive: true })
const files = {
  // Rising two-note chime.
  'correct.wav': synth([[880, 0.08], [1318.5, 0.14]]),
  // Low falling buzz.
  'wrong.wav': synth([[233, 0.12], [185, 0.18]], { wave: 'triangle', volume: 0.4 }),
}
for (const [name, samples] of Object.entries(files)) {
  const data = wav(samples)
  writeFileSync(new URL(name, dir), data)
  console.log(`public/sounds/${name}: ${data.length} bytes`)
}
