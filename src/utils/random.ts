export function generateTimestampUUID(): string {
  const timestamp = new Date().getTime().toString(16)
  const randomPart = Math.random().toString(16).substring(2, 6) // 12 characters of random data
  return `${timestamp}${randomPart}`
}
