import Driver from './driver'
import querystring from 'querystring'
import { json } from '../utils/request'

type RegisterService = {
  ID: string
  Name: string
  Port: number
  Address: string
}

type Check = {
  ID: string
  Name: string
  Status: string
  ServiceID: string
  HTTP: string | undefined
  Method: string
  TCP: string | undefined
  Interval: string | string[]
  Timeout: string | string[]
}

type Service = {
  ID: string
  Service: string
  Port: number
  Address: string
}

type HealthService = {
  AggregatedStatus: string
  Service: Service
}

export default class Consul implements Driver {
  private url: string

  constructor(url: string) {
    this.url = url
  }

  async register(name: string, protocol: string, hostname: string, port: number): Promise<boolean> {
    const parsedUrl = new URL(this.url)
    const queryParams = querystring.parse(parsedUrl.search.slice(1))
    const instanceId = queryParams.instanceId
    const token = queryParams.token
    let id: string
    if (instanceId == undefined) {
      id = `${name}:${port}`
    } else {
      id = `${name}-${instanceId}:${port}`
    }
    const rs: RegisterService = { ID: id, Name: name, Port: port, Address: hostname }
    const registerData = JSON.stringify(rs)
    const registerUrl = this.getUrl(parsedUrl, '/v1/agent/service/register', token)
    let isCheck = queryParams.check
    if (isCheck == 'true') {
      const res = await json(registerUrl, 'PUT', registerData)
      let interval = queryParams.interval
      if (!interval) {
        interval = '30s'
      }
      let timeout = queryParams.timeout
      if (!timeout) {
        timeout = '10s'
      }
      let http, tcp
      if (protocol == 'http' || protocol == 'https') {
        http = `${protocol}://${hostname}:${port}`
      } else if (protocol == 'tcp') {
        tcp = `${hostname}:${port}`
      }
      const check: Check = {
        ID: id,
        Name: name,
        Status: 'passing',
        ServiceID: id,
        HTTP: http,
        Method: name,
        TCP: tcp,
        Interval: interval,
        Timeout: timeout
      }
      const checkData = JSON.stringify(check)
      const checkUrl = this.getUrl(parsedUrl, '/v1/agent/check/register', token)
      await json(checkUrl, 'PUT', checkData)
      return res === ''
    } else {
      const res = await json(registerUrl, 'PUT', registerData)
      return res === ''
    }
  }

  async get(name: string): Promise<string> {
    const parsedUrl = new URL(this.url)
    const queryParams = querystring.parse(parsedUrl.search.slice(1))
    const token = queryParams.token
    const getUrl = this.getUrl(parsedUrl, `/v1/agent/health/service/name/${name}`, token)
    const res: string = await json(getUrl, 'GET', null)
    const list = JSON.parse(res)
    return list
      .map((item: HealthService) => `${item.Service.Address}:${item.Service.Port}`)
      .join(',')
  }

  private getUrl(parsedUrl: URL, path: string, token?: string | string[]): string {
    if (token) {
      return `${parsedUrl.origin}${path}?token=${token}`
    }
    return `${parsedUrl.origin}${path}`
  }
}
