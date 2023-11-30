export const WITHOUT_ERROR = 'WithoutError'
export const PARSE_ERROR = 'ParseError'
export const INVALID_REQUEST = 'InvalidRequest'
export const METHOD_NOT_FOUND = 'MethodNotFound'
export const INVALID_PARAMS = 'InvalidParams'
export const INTERNAL_ERROR = 'InternalError'
export const CUSTOM_ERROR = 'CustomError'


export const messages = {
  ParseError: 'Parse error',
  InvalidRequest: 'Invalid request',
  MethodNotFound: 'Method not found',
  InvalidParams: 'Invalid params',
  InternalError: 'Internal error'
}

export const codes = {
  WithoutError: 0,
  ParseError: -32700,
  InvalidRequest: -32600,
  MethodNotFound: -32601,
  InvalidParams: -32602,
  InternalError: -32603,
  CustomError: -32000
}
