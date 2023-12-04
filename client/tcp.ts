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

  private map: Map<string, Function> = new Map()

  private pool: Pool

  constructor(service: string, address: string, options?: {}) {
    this.service = service
    this.pool = new Pool(address, this)
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
      return new Promise((resolve, reject) => {
        this.map.set(id, (data: Response) => {
          if (data.error != undefined) {
            reject(new Error(data.error.message))
          } else if (data.result) {
            resolve(data.result)
          } else {
            reject(new Error('Unknown error'))
          }
        })
        setTimeout(() => {
          this.map.delete(id)
          reject()
        }, 10000)
      })
    })
  }

  handler(data: Response) {
    const callback = this.map.get(data.id)
    if (callback !== undefined) callback(data)
  }
}
