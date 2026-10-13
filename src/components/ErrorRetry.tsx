import styles from './ErrorRetry.module.css'

interface Props {
  message: string
  retryLabel?: string
  onRetry: () => void
}

/** Error message with a retry button, announced to screen readers. */
export function ErrorRetry({ message, retryLabel = '다시 시도', onRetry }: Props) {
  return (
    <div className={styles.box} role="alert">
      <p className={styles.message}>
        <span aria-hidden="true">⚠ </span>
        {message}
      </p>
      <button type="button" className={styles.retry} onClick={onRetry}>
        {retryLabel}
      </button>
    </div>
  )
}
