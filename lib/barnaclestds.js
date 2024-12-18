/**
 * Copyright reelyActive 2024
 * We believe in an open Internet of Things
 */

const EventEmitter = require('events').EventEmitter
const Raddec = require('raddec')
const RaddecFilter = require('raddec-filter')
const Tedious = require('tedious')

const DEFAULT_CONFIG = {
  server: '127.0.0.1',
  authentication: {
    type: 'default',
    options: { userName: 'admin', password: 'admin' }
  },
  options: {
    encrypt: false,
    database: 'pareto-anywhere'
  }
}
const DEFAULT_RADDEC_TABLE = 'raddec'
const DEFAULT_RADDEC_COLUMN = 'raddec'
const DEFAULT_DYNAMB_TABLE = 'dynamb'
const DEFAULT_DYNAMB_COLUMN = 'dynamb'
const DEFAULT_PRINT_ERRORS = false
const DEFAULT_RADDEC_FILTERS = {
  acceptedEvents: [Raddec.events.APPEARANCE, Raddec.events.DISPLACEMENT, Raddec.events.DISAPPEARANCE]
}
const DEFAULT_RADDEC_OPTIONS = {
  includePackets: false,
  filters: DEFAULT_RADDEC_FILTERS
}
const DEFAULT_DYNAMB_OPTIONS = {}
const DEFAULT_EVENTS_TO_STORE = {
  dynamb: DEFAULT_DYNAMB_OPTIONS
}
const SUPPORTED_EVENTS = ['raddec', 'dynamb']

/**
 * BarnaclesTDS Class
 * Detects events and writes to SQL Server using TDS.
 */
class BarnaclesTDS extends EventEmitter {
  /**
   * BarnaclesTDS constructor
   * @param {Object} options The options as a JSON object.
   * @constructor
   */
  constructor (options) {
    super()
    const self = this
    self.options = options || {}

    this.isTdsRequestPending = false
    this.tdsRequestQueue = []
    this.printErrors = options.printErrors || DEFAULT_PRINT_ERRORS
    const eventsToStore = options.eventsToStore || DEFAULT_EVENTS_TO_STORE
    self.eventsToStore = {}

    for (const event in eventsToStore) {
      const isSupportedEvent = SUPPORTED_EVENTS.includes(event)

      if (isSupportedEvent) {
        self.eventsToStore[event] =
          eventsToStore[event] || DEFAULT_EVENTS_TO_STORE[event]
      }
    }

    // The (provided) TDS connection has already been instantiated
    if (options.connection) {
      this.connection = options.connection
      handleConnectionEvents(self)
    } else { // Establish connection using the provided config options
      this.connection = new Tedious.Connection(
        options.config || DEFAULT_CONFIG
      )
      handleConnectionEvents(self)
      this.connection.connect()
    }
  }

  /**
   * Handle an outbound event.
   * @param {String} name The outbound event name.
   * @param {Object} data The outbound event data.
   */
  handleEvent (name, data) {
    const self = this
    const isEventToStore = self.eventsToStore.hasOwnProperty(name)

    if (isEventToStore) {
      switch (name) {
        case 'raddec':
          return handleRaddec(self, data)
        case 'dynamb':
          return handleDynamb(self, data)
      }
    }
  }
}

/**
 * Handle events from the SQL Server connection.
 * @param {BarnaclesTDS} instance The BarnaclesTDS instance.
 */
function handleConnectionEvents (instance) {
  instance.connection.on('connect', err => {
    if (err) {
      if (instance.printErrors) {
        console.log('barnacles-tds: Database connection failed with', err)
      }
    } else {
      if (instance.printErrors) {
        console.log('barnacles-tds: Database connection successful.')
      }
    }
  })
}

/**
 * Handle the given raddec by storing it in SQL Server.
 * @param {BarnaclesTDS} instance The BarnaclesTDS instance.
 * @param {Object} raddec The raddec data.
 */
function handleRaddec (instance, raddec) {
  const filter = new RaddecFilter(instance.eventsToStore?.raddec?.filters || DEFAULT_RADDEC_FILTERS)

  if (filter.isPassing(raddec) === false) {
    return
  }

  const raddecOptions = instance.eventsToStore.raddec

  const tdsRaddec = JSON.stringify(raddec.toFlattened(raddecOptions))
  const tableName = instance.options.raddecTable || DEFAULT_RADDEC_TABLE
  const columnName = instance.options.raddecColumn || DEFAULT_RADDEC_COLUMN
  const requestString = 'INSERT into ' + tableName + ' (' + columnName +
                        ") VALUES ('" + tdsRaddec + "'); SELECT @@identity"

  instance.tdsRequestQueue.push({ requestString: requestString,
                                  event: { name: 'raddec', data: raddec } })

  if(!instance.isTdsRequestPending) {
    tdsRequest(instance)
  }
}

/**
 * Handle the given dynamb by storing it in SQL Server.
 * @param {BarnaclesTDS} instance The BarnaclesTDS instance.
 * @param {Object} dynamb The dynamb data.
 */
function handleDynamb (instance, dynamb) {
  const message = JSON.stringify(dynamb)
  const tableName = instance.options.dynambTable || DEFAULT_DYNAMB_TABLE
  const columnName = instance.options.dynambColumn || DEFAULT_DYNAMB_COLUMN
  const requestString = 'INSERT into ' + tableName + ' (' + columnName +
                        ") VALUES ('" + message + "'); SELECT @@identity"

  instance.tdsRequestQueue.push({ requestString: requestString,
                                  event: { name: 'dynamb', data: dynamb } })

  if(!instance.isTdsRequestPending) {
    tdsRequest(instance)
  }
}

/**
 * Execute the next request in the queue and self-iterate, if required.
 * @param {BarnaclesTDS} instance The BarnaclesTDS instance.
 */
function tdsRequest(instance) {
  let item = instance.tdsRequestQueue.shift()
  instance.isTdsRequestPending = true

  // "As only one request at a time may be executed on a connection, another
  // request should not be initiated until this callback is called."
  // https://tediousjs.github.io/tedious/api-request.html#function_newRequest
  let request = new Tedious.Request(item.requestString, (err, rowCount) => {
    if(err && instance.printErrors) {
      console.error('barnacles-tds: error creating request')
    }

    let isMoreTdsRequests = (instance.tdsRequestQueue.length > 0)

    if(isMoreTdsRequests) {
      return tdsRequest(instance)
    } else {
      instance.isTdsRequestPending = false
    }
  })

  // Append the _storeId to the original event and emit
  request.on('row', function (columns) {
    Object.assign(item.event.data, { _storeId: columns[0].value })
    instance.emit(item.event.name, item.event.data)
  })

  instance.connection.execSql(request)
}

module.exports = BarnaclesTDS
