type Request = {
  id: string
  jsonrpc: string
  method: string
  params: Array<any>
}

export const JSONRPC = '2.0'

export function newRequest(id: string, method: string, params: Array<any>) {
  return {
    id,
    jsonrpc: JSONRPC,
    method,
    params
  }
}

export default Request
