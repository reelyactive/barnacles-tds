/**
 * Copyright reelyActive 2024-2026
 * We believe in an open Internet of Things
 */


const Tedious = require('tedious');
const EventEmitter = require('events').EventEmitter;
const Raddec = require('raddec');
const RaddecFilter = require('raddec-filter');
const DynambFilter = require('dynamb-filter');


const DEFAULT_CONFIG = {
  server: "localhost",
  authentication: {
    type: "default",
    options: { userName: "admin", password: "admin" }
  },
  options: {
    encrypt: false,
    database: "pareto-anywhere"
  }
};
const DEFAULT_RADDEC_TABLE = 'raddec';
const DEFAULT_RADDEC_COLUMN = 'raddec';
const DEFAULT_DYNAMB_TABLE = 'dynamb';
const DEFAULT_DYNAMB_COLUMN = 'dynamb';
const DEFAULT_PRINT_ERRORS = false;
const DEFAULT_RADDEC_FILTERS = {
  acceptedEvents: [ Raddec.events.APPEARANCE, Raddec.events.DISPLACEMENT,
                    Raddec.events.DISAPPEARANCE ]
};
const DEFAULT_RADDEC_OPTIONS = {
  includePackets: false,
  filterParameters: DEFAULT_RADDEC_FILTERS
};
const DEFAULT_DYNAMB_OPTIONS = { filterParameters: {} };
const DEFAULT_EVENTS_TO_STORE = {
  dynamb: DEFAULT_DYNAMB_OPTIONS
};
const SUPPORTED_EVENTS = [ 'raddec', 'dynamb' ];
const EVENT_FILTER_CLASSES = { raddec: RaddecFilter,
                               dynamb: DynambFilter };


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
  constructor(options) {
    super();
    const self = this;
    self.options = options || {};

    this.isClientConnected = false;
    this.isTdsRequestPending = false;
    this.tdsRequestQueue = [];
    this.printErrors = options.printErrors || DEFAULT_PRINT_ERRORS;
    const eventsToStore = options.eventsToStore || DEFAULT_EVENTS_TO_STORE;
    self.eventsToStore = {};

    for(const event in eventsToStore) {
      const isSupportedEvent = SUPPORTED_EVENTS.includes(event);

      if(isSupportedEvent) {
        let eventToStore = eventsToStore[event] ||
                           DEFAULT_EVENTS_TO_STORE[event];
        let filterParameters = eventToStore.filterParameters || {};
        eventToStore.filter = new EVENT_FILTER_CLASSES[event](filterParameters);
        self.eventsToStore[event] = eventToStore;
      }
    }

    // The (provided) TDS connection has already been instantiated
    if(options.connection) {
      this.connection = options.connection;
      handleConnectionEvents(self);
    }
    // Establish connection using the provided config options
    else {
      establishConnection(self, options.config);
    }
  }

  /**
   * Handle an outbound event.
   * @param {String} name The outbound event name.
   * @param {Object} data The outbound event data.
   */
  handleEvent(name, data) {
    const self = this;
    const isEventToStore = self.eventsToStore.hasOwnProperty(name);

    if(isEventToStore) {
      switch(name) {
        case 'raddec':
          return handleRaddec(self, data);
        case 'dynamb':
          return handleDynamb(self, data);
      }
    }
  }
}


/**
 * Establish the SQL Server connection.
 * @param {BarnaclesTDS} instance The BarnaclesTDS instance.
 * @param {Object} config The Tedious configuration options.
 */
function establishConnection(instance, config) {
  instance.connection = new Tedious.Connection(config || DEFAULT_CONFIG);

  instance.connection.connect((err) => {
    if(err) {
      console.log('barnacles-tds: Database connection failed.', err.message);
    }
    else {
      instance.isClientConnected = true;
      handleConnectionEvents(instance);
      console.log('barnacles-tds: Database connection successful.');
    }
  });
}


/**
 * Handle events from the SQL Server connection.
 * @param {BarnaclesTDS} instance The BarnaclesTDS instance.
 */
function handleConnectionEvents(instance) {
  instance.connection.on('end', () => {
    instance.isClientConnected = false;
    console.log('barnacles-tds: Database connection closed.');
  });
  instance.connection.on('error', (err) => {
    instance.isClientConnected = false;
    if(instance.printErrors) {
      console.log('barnacles-tds: Tedious error.', err.message);
    }
  });
  instance.connection.on('errorMessage', (err) => {
    if(instance.printErrors) {
      console.log('barnacles-tds: Database error.', err.message);
    }
  });
}


/**
 * Handle the given raddec by storing it in SQL Server.
 * @param {BarnaclesTDS} instance The BarnaclesTDS instance.
 * @param {Object} raddec The raddec data.
 */
function handleRaddec(instance, raddec) {
  let raddecOptions = instance.eventsToStore['raddec'];

  if(raddecOptions.filter.isPassing(raddec)) {
    const tdsRaddec = JSON.stringify(raddec.toFlattened(raddecOptions));
    const tableName = instance.options.raddecTable || DEFAULT_RADDEC_TABLE;
    const columnName = instance.options.raddecColumn || DEFAULT_RADDEC_COLUMN;
    const requestString = 'INSERT into ' + tableName + ' (' + columnName +
                          ") VALUES ('" + tdsRaddec + "'); SELECT @@identity";

    instance.tdsRequestQueue.push({ requestString: requestString,
                                    event: { name: 'raddec', data: raddec } });

    if(!instance.isTdsRequestPending) {
      tdsRequest(instance);
    }
  }
}


/**
 * Handle the given dynamb by storing it in SQL Server.
 * @param {BarnaclesTDS} instance The BarnaclesTDS instance.
 * @param {Object} dynamb The dynamb data.
 */
function handleDynamb(instance, dynamb) {
  let dynambOptions = instance.eventsToStore['dynamb'];

  if(dynambOptions.filter.isPassing(dynamb)) {
    // accelerationTimeSeries property automatically removed due to its size
    let trimmedDynamb = Object.assign({}, dynamb);
    delete trimmedDynamb.accelerationTimeSeries;

    const tdsDynamb = JSON.stringify(trimmedDynamb);
    const tableName = instance.options.dynambTable || DEFAULT_DYNAMB_TABLE;
    const columnName = instance.options.dynambColumn || DEFAULT_DYNAMB_COLUMN;
    const requestString = 'INSERT into ' + tableName + ' (' + columnName +
                          ") VALUES ('" + tdsDynamb + "'); SELECT @@identity";

    instance.tdsRequestQueue.push({ requestString: requestString,
                                    event: { name: 'dynamb', data: dynamb } });

    if(!instance.isTdsRequestPending) {
      tdsRequest(instance);
    }
  }
}


/**
 * Execute the next request in the queue and self-iterate, if required.
 * @param {BarnaclesTDS} instance The BarnaclesTDS instance.
 */
function tdsRequest(instance) {
  if(!instance.isClientConnected) {
    instance.isTdsRequestPending = false;
    return;
  }

  let item = instance.tdsRequestQueue.shift();
  instance.isTdsRequestPending = true;

  // "As only one request at a time may be executed on a connection, another
  // request should not be initiated until this callback is called."
  // https://tediousjs.github.io/tedious/api-request.html#function_newRequest
  let request = new Tedious.Request(item.requestString, (error, rowCount) => {
    if(error && instance.printErrors) {
      console.error('barnacles-tds: error creating request');
    }

    let isMoreTdsRequests = (instance.tdsRequestQueue.length > 0);

    if(isMoreTdsRequests) {
      return setImmediate(() => tdsRequest(instance)); // Yield to event loop
    }
    else {
      instance.isTdsRequestPending = false;
    }
  })

  // Append the _storeId to the original event and emit
  request.on('row', (columns) => {
    Object.assign(item.event.data, { _storeId: columns[0].value });
    instance.emit(item.event.name, item.event.data);
  });

  instance.connection.execSql(request);
}


module.exports = BarnaclesTDS;
