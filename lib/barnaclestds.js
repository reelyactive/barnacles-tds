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
  if (instance.connection.state.name !== 'LoggedIn') {
    if (instance.printErrors) {
      console.error(
        'barnacles-tds: SQL Server connection not logged in. The message will not be stored.'
      )
    }
    return
  }

  const filter = new RaddecFilter(instance.eventsToStore?.raddec?.filters || DEFAULT_RADDEC_FILTERS)

  if (filter.isPassing(raddec) === false) {
    return
  }

  const raddecOptions = instance.eventsToStore.raddec

  const tdsRaddec = JSON.stringify(raddec.toFlattened(raddecOptions))
  const tableName = instance.options.raddecTable || DEFAULT_RADDEC_TABLE
  const columnName = instance.options.raddecColumn || DEFAULT_RADDEC_COLUMN
  const request = new Tedious.Request(
    'INSERT into ' +
      tableName +
      ' (' +
      columnName +
      ") VALUES ('" +
      tdsRaddec +
      "'); SELECT @@identity",
    function (err) {
      if (err && instance.printErrors) {
        console.error(err)
      }
    }
  )

  request.on('row', function (columns) {
    const storeId = { _storeId: columns[0].value }
    raddec = Object.assign(raddec, storeId)
    instance.emit('raddec', raddec)
  })

  instance.connection.execSql(request, function (error, rowCount, rows) {
    if (error && instance.printErrors) {
      console.error('Error inserting raddec: ' + error.stack)
    }
  })
}

/**
 * Handle the given dynamb by storing it in SQL Server.
 * @param {BarnaclesTDS} instance The BarnaclesTDS instance.
 * @param {Object} dynamb The dynamb data.
 */
function handleDynamb (instance, dynamb) {
  if (instance.connection.state.name !== 'LoggedIn') {
    console.error(
      'barnacles-tds: SQL Server connection not logged in. The message will not be stored.'
    )
    return
  }

  const message = JSON.stringify(dynamb)
  const tableName = instance.options.dynambTable || DEFAULT_DYNAMB_TABLE
  const columnName = instance.options.dynambColumn || DEFAULT_DYNAMB_COLUMN
  const request = new Tedious.Request(
    'INSERT into ' +
      tableName +
      ' (' +
      columnName +
      ") VALUES ('" +
      message +
      "'); SELECT @@identity",
    function (err) {
      if (err && instance.printErrors) {
        console.error(err)
      }
    }
  )

  request.on('row', function (columns) {
    const storeId = { _storeId: columns[0].value }
    dynamb = Object.assign(dynamb, storeId)
    instance.emit('dynamb', dynamb)
  })

  instance.connection.execSql(request, function (error, rowCount, rows) {
    if (error && instance.printErrors) {
      console.error('Error inserting dynamb: ' + error.stack)
    }
  })
}

module.exports = BarnaclesTDS
