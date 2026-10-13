export const NICKNAME_MIN = 2
export const NICKNAME_MAX = 10

/** Returns an error message for an invalid nickname, or null when it is valid. Input is trimmed first. */
export function validateNickname(raw: string): string | null {
  const nickname = raw.trim()
  const length = [...nickname].length
  if (length < NICKNAME_MIN || length > NICKNAME_MAX) {
    return `닉네임은 ${NICKNAME_MIN}~${NICKNAME_MAX}자로 입력해 주세요.`
  }
  if (!/^[가-힣a-zA-Z0-9]+$/.test(nickname)) {
    return '닉네임에는 한글, 영문, 숫자만 쓸 수 있어요.'
  }
  return null
}
