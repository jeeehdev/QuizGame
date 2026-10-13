export type SoundName = 'correct' | 'wrong'

const STORAGE_KEY = 'quiz.soundEnabled'
const SOURCES: Record<SoundName, string> = {
  correct: `${import.meta.env.BASE_URL}sounds/correct.wav`,
  wrong: `${import.meta.env.BASE_URL}sounds/wrong.wav`,
}

let audios: Partial<Record<SoundName, HTMLAudioElement>> = {}

/** Starts downloading the sound files so the first answer plays without delay. */
export function preloadSounds(): void {
  if (typeof Audio === 'undefined' || Object.keys(audios).length > 0) return
  audios = Object.fromEntries(
    Object.entries(SOURCES).map(([name, src]) => {
      const audio = new Audio(src)
      audio.preload = 'auto'
      audio.load()
      return [name, audio]
    }),
  )
}

export function playSound(name: SoundName): void {
  const audio = audios[name]
  if (!audio) return
  // Autoplay policies, missing files or environments without audio must never break the game.
  try {
    audio.currentTime = 0
    audio.play()?.catch(() => {})
  } catch {
    // Ignore: sound is optional.
  }
}

/** Sound is on by default; the viewer's choice is remembered in this browser. */
export function loadSoundEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'false'
  } catch {
    return true
  }
}

export function saveSoundEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(enabled))
  } catch {
    // Storage can be unavailable (private mode); the toggle still works for this session.
  }
}
