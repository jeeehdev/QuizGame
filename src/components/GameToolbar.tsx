import styles from './GameToolbar.module.css'

interface Props {
  soundEnabled: boolean
  onToggleSound: () => void
  onQuit: () => void
}

export function GameToolbar({ soundEnabled, onToggleSound, onQuit }: Props) {
  return (
    <div className={styles.toolbar}>
      <button type="button" className={styles.button} onClick={onQuit}>
        <span aria-hidden="true">←</span> 처음으로
      </button>
      <button type="button" className={styles.button} onClick={onToggleSound} aria-pressed={soundEnabled}>
        <span aria-hidden="true">{soundEnabled ? '🔊' : '🔇'}</span> 효과음 {soundEnabled ? '켜짐' : '꺼짐'}
      </button>
    </div>
  )
}
