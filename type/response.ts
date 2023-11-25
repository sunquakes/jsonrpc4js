import { JSONRPC } from './request'

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

export function newError(id: string, code: number, data?: any) {
  return {
    id,
    jsonrpc: JSONRPC,
    error: {
      code,
      message: '',
      data: data
    }
  }
}

export default Response
