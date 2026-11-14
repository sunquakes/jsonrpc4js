import { randomUUID } from 'crypto'

export function generateTimestampUUID(): string {
  return randomUUID()
}
