import { JSONRPC } from './request'
import { codes, messages } from './error'

type Response = {
  id: string
  jsonrpc: string
  result?: any
  error?: Error
}

type Error = {
  code: number
  message: string
  data: any
}

export function newResult(id: string, result: any) {
  return { id, jsonrpc: JSONRPC, result }
}

export function newError(id: string, code: string, message?: string, data?: any) {
  return {
    id,
    jsonrpc: JSONRPC,
    error: {
      code: codes[code as keyof typeof codes],
      message: messages[code as keyof typeof messages],
      data: data
    }
  }
}

export default Response
