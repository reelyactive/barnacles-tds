/**
 * Copyright reelyActive 2024
 * We believe in an open Internet of Things
 */


const Tedious = require("tedious");


const DEFAULT_CONFIG = {
    server: "127.0.0.1",
    authentication: {
      type: "default",
      options: { userName: "admin", password: "admin" }
    },
    options: {
      encrypt: false,
      database: "pareto-anywhere"
    }
};
const DEFAULT_RADDEC_TABLE = "raddec";
const DEFAULT_DYNAMB_TABLE = "dynamb";
const DEFAULT_DYNAMB_COLUMN = "dynamb";
const DEFAULT_PRINT_ERRORS = false;
const DEFAULT_RADDEC_OPTIONS = { includePackets: false };
const DEFAULT_DYNAMB_OPTIONS = {};
const DEFAULT_EVENTS_TO_STORE = {
  raddec: DEFAULT_RADDEC_OPTIONS,
  dynamb: DEFAULT_DYNAMB_OPTIONS,
};
const SUPPORTED_EVENTS = [ "raddec", "dynamb" ];


/**
 * BarnaclesTDS Class
 * Detects events and writes to SQL Server using TDS.
 */
class BarnaclesTDS {

  /**
   * BarnaclesTDS constructor
   * @param {Object} options The options as a JSON object.
   * @constructor
   */
  constructor(options) {
    let self = this;
    self.options = options || {};

    this.printErrors = options.printErrors || DEFAULT_PRINT_ERRORS;
    this.eventsToStore = {};
    let eventsToStore = options.eventsToStore || DEFAULT_EVENTS_TO_STORE;

    for(const event in eventsToStore) {
      let isSupportedEvent = SUPPORTED_EVENTS.includes(event);

      if(isSupportedEvent) {
        self.eventsToStore[event] =
          eventsToStore[event] || DEFAULT_EVENTS_TO_STORE[event];
      }
    }

    // The (provided) TDS connection has already been instantiated
    if(options.connection) {
      this.connection = options.connection;
      handleConnectionEvents(self);
    }
    // Establish connection using the provided config options
    else {
      this.connection = new Tedious.Connection(options.config ||
                                               DEFAULT_CONFIG);
      handleConnectionEvents(self);
      this.connection.connect();
    }
  }

  /**
   * Handle an outbound event.
   * @param {String} name The outbound event name.
   * @param {Object} data The outbound event data.
   */
  handleEvent(name, data) {
    let self = this;
    let isEventToStore = self.eventsToStore.hasOwnProperty(name);

    if(isEventToStore) {
      switch (name) {
        case "raddec":
          return handleRaddec(self, data);
        case "dynamb":
          return handleDynamb(self, data);
      }
    }
  }
}


/**
 * Handle events from the SQL Server connection.
 * @param {BarnaclesTDS} instance The BarnaclesTDS instance.
 */
function handleConnectionEvents(instance) {
  console.log("barnacles-tds: Handling connection events.");
  instance.connection.on("connect", (err) => {
    if(err) {
      console.log("barnacles-tds: Database connection failed with", err);
    }
    else {
      console.log("barnacles-tds: Database connection successful.");
    }
  });
}


/**
 * Handle the given raddec by storing it in SQL Server.
 * @param {BarnaclesTDS} instance The BarnaclesTDS instance.
 * @param {Object} raddec The raddec data.
 */
function handleRaddec(instance, raddec) {
  let raddecOptions = instance.eventsToStore[ "raddec" ];

  // TODO: store raddecs in SQL Server???
}


/**
 * Handle the given dynamb by storing it in SQL Server.
 * @param {BarnaclesTDS} instance The BarnaclesTDS instance.
 * @param {Object} dynamb The dynamb data.
 */
function handleDynamb(instance, dynamb, callback) {
  if(instance.connection.state.name !== "LoggedIn") {
    console.error(
      "barnacles-tds: SQL Server connection not logged in. The message will not be stored."
    );
    return;
  }
  let dynambOptions = instance.eventsToStore[ "dynamb" ];

  let message = JSON.stringify(dynamb);
  let tableName = instance.options.dynambTable || DEFAULT_DYNAMB_TABLE;
  let columnName = instance.options.dynambColumn || DEFAULT_DYNAMB_COLUMN;
  let request = new Tedious.Request(
    "INSERT into " +
      tableName +
      " (" +
      columnName +
      ") VALUES ('" +
      message +
      "'); SELECT @@identity",
    function(err) {
      if(err && instance.printErrors) {
        console.error(err);
      }
    }
  );

  request.on("row", function (columns) {
    let storeId = { _storeId: columns[0].value };
    dynamb = Object.assign(dynamb, storeId);
    if (callback && typeof callback === "function") {
      callback("dynamb", dynamb);
    }
  });

  instance.connection.execSql(request, function (error, rowCount, rows) {
    if(error && instance.printErrors) {
      console.error("Error inserting dynamb: " + error.stack);
    }
    handleDynambQueryResult(error, rowCount, rows, dynamb, callback);
  });
}


module.exports = BarnaclesTDS;
