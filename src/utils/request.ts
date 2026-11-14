import * as http from 'http'

export function json(url: string, method: string, body: string | null): Promise<any> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      url,
      {
        method: method,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': body ? Buffer.byteLength(body) : 0
        }
      },
      (res) => {
        if (res.statusCode !== 200) {
          // Drain the response so the underlying socket can be reused.
          res.resume()
          reject(new Error(`Request failed with status code ${res.statusCode}`))
          return
        }
        let data = ''

        res.setEncoding('utf8')
        res.on('data', (chunk) => {
          data += chunk
        })
        res.on('end', () => {
          resolve(data)
        })
        res.on('error', reject)
      }
    )
    req.on('error', reject)
    if (body) {
      req.write(body)
    }
    req.end()
  })
}

export function get(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    http
      .get(url, (res) => {
        if (res.statusCode !== 200) {
          res.resume()
          reject(new Error(`Request failed with status code ${res.statusCode}`))
          return
        }
        let data = ''

        res.setEncoding('utf8')
        res.on('data', (chunk) => {
          data += chunk
        })
        res.on('end', () => {
          resolve(data)
        })
        res.on('error', reject)
      })
      .on('error', reject)
  })
}
