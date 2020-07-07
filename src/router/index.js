import './Response'
import http from 'http'
import parse from './parseparams'
import queryparams from './queryparams'
import Trouter from './Trouter'

const newId = () => {
  return (Date.now().toString(36) + Math.random().toString(36).substr(2, 5))// .toUpperCase()
}

class NaturalRouter extends Trouter {
  constructor (config = {}, id) {
    super()
    this.id = id || newId() // Identifier the router
    this.config = Object.assign({
      defaultRoute: (req, res) => {
        res.statusCode = 404
        res.end()
      },
      errorHandler: (err, req, res) => {
        res.send(err)
      }
    }, config)
    this.modules = {}
    this.server = undefined
    this.port = undefined
  }

  listen (port = 3000) {
    this.port = port
    if (this.server === undefined) {
      this.server = http.createServer()
    }
    this.server.on('request', this.lookup.bind(this))

    return new Promise((resolve, reject) => {
      this.server.listen(port, error => {
        if (error) {
          reject(error)
        } else {
          resolve(this.port)
        }
      })
    })
  }

  use (route /*, ...fns */) {
    if (typeof route === 'function') {
      super.use('/', route)
      return this
    }
    super.use.apply(this, arguments)

    if (arguments[1] instanceof NaturalRouter) {
      const { pattern } = parse(route, true)
      this.modules[arguments[1].id] = pattern
    }

    return this
  }

  // https://github.com/jkyberneees/0http/blob/master/lib/router/sequential.js#L51
  lookup (req, res, step) {
    if (!req.url) {
      req.url = '/'
    }
    if (!req.originalUrl) {
      req.originalUrl = req.url
    }

    Object.assign(req, queryparams(req.url))

    const match = this.find(req.method, req.path)

    if (match.handlers.length !== 0) {
      const middlewares = match.handlers.slice(0)

      if (step !== undefined) {
        // router is being used as a nested router
        middlewares.push((req, res, next) => {
          req.url = req.preRouterUrl
          req.path = req.preRouterPath

          delete req.preRouterUrl
          delete req.preRouterPath

          return step()
        })
      }

      if (req.params === undefined) {
        req.params = {}
      }
      Object.assign(req.params, match.params)

      /* const cbInternal = (req, res, next) => {

      } */

      const next = (index) => {
        const middleware = middlewares[index]

        if (middleware === undefined) {
          if (!res.finished) {
            return this.config.defaultRoute(req, res)
          }
          return
        }

        const stepInternal = (error) => {
          if (error) {
            return this.config.errorHandler(error, req, res)
          } else {
            return next(index + 1)
          }
        }

        try {
          if (middleware instanceof NaturalRouter) {
            // nested routes support
            const pattern = this.modules[middleware.id]
            if (pattern) {
              req.preRouterUrl = req.url
              req.preRouterPath = req.path

              req.url = req.url.replace(pattern, '')
            }

            return middleware.lookup(req, res, step)
          } else {
            return middleware(req, res, stepInternal)
          }
        } catch (error) {
          return this.config.errorHandler(error, req, res)
        }
      }

      next(0)
    } else {
      this.config.defaultRoute(req, res)
    }
  }

  on (/* method, pattern, ...handlers */) {
    this.add.apply(this, arguments)
  }

  /**
   * @doc https://www.fastify.io/docs/latest/Routes/#routes-option
   * @param {Object} config
   */
  route ({ method, url, handler }) {
    this.on(method, url, handler)
  }

  newRouter (id) {
    return new NaturalRouter(this.config, id)
  }
}

export default NaturalRouter