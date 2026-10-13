import { useEffect, useRef, type KeyboardEvent } from 'react'
import styles from './ConfirmDialog.module.css'

interface Props {
  title: string
  message: string
  confirmLabel: string
  cancelLabel: string
  onConfirm: () => void
  onCancel: () => void
}

/** In-page confirm dialog (window.confirm is avoided so it can be styled and tested). */
export function ConfirmDialog({ title, message, confirmLabel, cancelLabel, onConfirm, onCancel }: Props) {
  const cancelRef = useRef<HTMLButtonElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)

  // Focus the safe choice first, and give focus back to where it was when the dialog closes.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    cancelRef.current?.focus()
    return () => previous?.focus?.()
  }, [])

  function handleKeyDown(event: KeyboardEvent) {
    // Keep game shortcuts (1–4, Enter) from reaching the question screen.
    event.stopPropagation()
    if (event.key === 'Escape') {
      event.preventDefault()
      onCancel()
    } else if (event.key === 'Tab') {
      // Trap focus between the two buttons.
      event.preventDefault()
      const next = document.activeElement === cancelRef.current ? confirmRef.current : cancelRef.current
      next?.focus()
    }
  }

  return (
    <div className={styles.backdrop} onKeyDown={handleKeyDown}>
      <div
        className={styles.dialog}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-message"
      >
        <h2 id="confirm-title" className={styles.title}>
          {title}
        </h2>
        <p id="confirm-message" className={styles.message}>
          {message}
        </p>
        <div className={styles.actions}>
          <button ref={cancelRef} type="button" className={styles.cancel} onClick={onCancel}>
            {cancelLabel}
          </button>
          <button ref={confirmRef} type="button" className={styles.confirm} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
