import Client from './client'
import { generateTimestampUUID } from '../utils/random'
import Pool from './pool'
import Response from '../type/response'
import { newRequest } from '../type/request'
import Driver from 'discovery/driver'

export type Options = {
  delimiter: string
}

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
    this.pool = new Pool(service, address, this)
    if (options !== undefined) {
      this.options = Object.assign(this.options, options)
    }
  }

  async call(method: string, ...args: any[]): Promise<any> {
    const id = generateTimestampUUID()
    const request = newRequest(id, this.service + '/' + method, args)
    const delimiter = this.options.delimiter
    return this.pool.borrow().then((conn) => {
      const res = conn.write(JSON.stringify(request) + delimiter)
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

  handler(res: string) {
    const delimiter = this.options.delimiter
    res = res.substring(0, res.length - delimiter.length)
    const data = JSON.parse(res)
    const callback = this.map.get(data.id)
    if (callback !== undefined) callback(data)
  }
}
