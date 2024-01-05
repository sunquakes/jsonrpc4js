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
          const error = new Error(`Request failed with status code ${res.statusCode}`)
          req.emit('error', error)
        } else {
          let data = ''

          res.on('data', (chunk) => {
            data += chunk
          })

          res.on('end', () => {
            resolve(data)
          })
        }
      }
    )
    req.on('error', (error: Error) => {
      reject(error)
    })
    if (body) {
      req.write(body)
    }
    req.end()
  })
}

export function get(url: string): Promise<any> {
  return new Promise((resolve) => {
    http.get(url, (res) => {
      let data = ''

      res.on('data', (chunk) => {
        data += chunk
      })
      res.on('end', () => {
        resolve(data)
      })
    })
  })
}
