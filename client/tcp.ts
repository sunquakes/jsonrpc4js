import Client from './client'
import { generateTimestampUUID } from '../utils/random'
import Pool from './pool'
import Response from '../type/response'
import { newRequest } from '../type/request'

export default class Tcp implements Client {
  /**
   * The remote service name.
   */
  private service: string

  private map: Map<string, Function>

  private pool: Pool

  constructor(service: string, address: string, options?: {}) {
    this.service = service
    this.map = new Map<string, Function>()
    this.pool = new Pool(address, this.handler)
  }

  async call(method: string, ...args: any[]): Promise<any> {
    const id = generateTimestampUUID()
    const request = newRequest(id, this.service + '/' + method, args)
    return this.pool.borrow().then((conn) => {
      const res = conn.write(JSON.stringify(request))
      if (res === true) {
        // Release the connection.
        this.pool.release(conn)
      } else {
        return Promise.reject(new Error('The connection was broken.'))
      }
      return new Promise((resolve) => {
        this.map.set(id, resolve)
        setTimeout(() => {
          this.map.delete(id)
        }, 10000)
      })
    })
  }

  handler(data: Response) {
    const resolve = this.map.get(data.id)
    if (resolve !== undefined) resolve(data)
  }
}
