const lnd = require('./lnd.js')
const metadata = require('../dazaar-payment/metadata')
const cLightning = require('./c-lightning.js')

const MAX_SUBSCRIBER_CACHE = 500

module.exports = class DazaarLightningPayment {
  constructor (seller, payment, opts = {}) {
    this.seller = seller
    this.payment = payment
    this.lightning = node(seller, opts)
    this.subscribers = new Map()
    this.destroyed = false
  }

  init () {
    this.lightning.init()
  }

  validate (buyer, cb) {
    if (this.destroyed) return process.nextTick(cb, new Error('Seller is shutting down'))
    const tail = this._get(buyer)

    const timeout = setTimeout(ontimeout, 20000)
    let timedout = false
    if (tail.synced || tail.active()) return process.nextTick(onsynced)

    tail.on('synced', onsynced)
    tail.on('update', onupdate)

    function ontimeout () {
      timedout = true
      onsynced()
    }

    function onupdate () {
      if (tail.active()) onsynced()
    }

    function onsynced () {      
      tail.removeListener('synced', onsynced)
      tail.removeListener('update', onupdate)
      clearTimeout(timeout)

      const time = tail.remainingTime()      

      if (time <= 0) return cb(new Error('No time left on subscription' + (timedout ? 'after timeout' : '')))

      cb(null, {
        type: 'time',
        remaining: time
      })
    }
  }

  buy (buyer, amount, auth, cb) {
    // requestInovice(amount, function (err, invoice))

    function shouldIPay () {

    }
  }

  destroy () {
    if (this.destroyed) return
    this.destroyed = true

    for (const tail of this.subscribers.values()) {
      tail.destroy()
    }
  }

  _filter (buyer) {
    return metadata(this.seller, buyer)
  }

  _get (buyer) {
    const h = buyer.toString('hex')
    if (this.subscribers.has(h)) return this.subscribers.get(h)
    if (this.subscribers.size >= MAX_SUBSCRIBER_CACHE) this._gc()

    const self = this
    const tail = this.lightning.subscription(this._filter(buyer), this.payment)
    this.subscribers.set(h, tail)

    return tail
  }

  _gc () {
    for (const [h, tail] of this.subscribers) {
      tail.destroy()
      this.subscribers.delete(h)
      return
    }
  }

  static supports (payment) {
    return payment.currency === 'LightningBTC'
  }
}

function node (seller, opts) {
  if (opts.implementation === 'lnd') return new lnd(seller, opts.rpc)
  if (opts.implementation === 'c-lightning') return new cLightning(seller, opts.rpc)

  throw new Error('unrecognised lightning node: specify lnd or c-lightning.')
}
