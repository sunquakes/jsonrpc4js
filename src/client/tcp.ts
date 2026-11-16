import Client from './client'
import { generateTimestampUUID } from '../utils/random'
import Pool from './pool'
import Response from '../type/response'
import { newRequest } from '../type/request'
import Driver from '../discovery/driver'

export type Options = {
  delimiter: string
}

const CALL_TIMEOUT = 10000

export default class Tcp implements Client {
  /**
   * The remote service name.
   */
  private service: string

  /**
   * The callback map, the key is message id.
   */
  private map: Map<string, Function> = new Map()

  /**
   * The connection pool.
   */
  private pool: Pool

  /**
   * The client options.
   */
  private options: Options = { delimiter: '\r\n' }

  constructor(service: string, address: string | Driver, options?: {}) {
    this.service = service
    if (options !== undefined) {
      this.options = Object.assign(this.options, options)
    }
    this.pool = new Pool(service, address, this, { delimiter: this.options.delimiter })
  }

  async call(method: string, ...args: any[]): Promise<any> {
    const id = generateTimestampUUID()
    const request = newRequest(id, this.service + '/' + method, args)
    const conn = await this.pool.borrow()
    return new Promise((resolve, reject) => {
      let timer: NodeJS.Timeout
      this.map.set(id, (data: Response) => {
        clearTimeout(timer)
        this.map.delete(id)
        if (data.error !== undefined) {
          reject(new Error(data.error.message))
          return
        }
        resolve(data.result)
      })
      timer = setTimeout(() => {
        this.map.delete(id)
        reject(new Error('Timeout'))
      }, CALL_TIMEOUT)
      // The connection is multiplexed by request id, so it can go back to the
      // pool as soon as the request has been written.
      conn.write(JSON.stringify(request) + this.options.delimiter)
      this.pool.release(conn)
    })
  }

  handler(res: string) {
    let data: Response
    try {
      data = JSON.parse(res)
    } catch (e) {
      return
    }
    const callback = this.map.get(data.id)
    if (callback !== undefined) callback(data)
  }
}
