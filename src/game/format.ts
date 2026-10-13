export function formatDuration(totalSec: number): string {
  const minutes = Math.floor(totalSec / 60)
  const seconds = totalSec % 60
  return minutes > 0 ? `${minutes}분 ${seconds}초` : `${seconds}초`
}
