barnacles-tds
=============

__barnacles-tds__ writes IoT data to a SQL Server database using TDS (Tabular Data Stream).

![Overview of barnacles-tds](https://reelyactive.github.io/barnacles-tds/images/overview.png)

__barnacles-tds__ ingests a real-time stream of _raddec_ and _dynamb_ objects from [barnacles](https://github.com/reelyactive/barnacles/) which it writes to the specified SQL Server database as JSON.  It couples seamlessly with reelyActive's [Pareto Anywhere](https://www.reelyactive.com/pareto/anywhere/) open source IoT middleware.

__barnacles-tds__ is a lightweight [Node.js package](https://www.npmjs.com/package/barnacles-tds) that can run on resource-constrained edge devices as well as on powerful cloud servers and anything in between.


Pareto Anywhere integration
---------------------------

A common application of __barnacles-tds__ is to write IoT data from [pareto-anywhere](https://github.com/reelyactive/pareto-anywhere) to a SQL Server database.  Simply follow our [Create a Pareto Anywhere startup script](https://reelyactive.github.io/diy/pareto-anywhere-startup-script/) tutorial using the script below:

```javascript
#!/usr/bin/env node

const ParetoAnywhere = require('../lib/paretoanywhere.js');

// Edit the options to match your SQL Server configuration
const BARNACLES_TDS_OPTIONS = {
    server: "127.0.0.1",
    username: "admin",
    password: "admin",
    instanceName: "pareto-anywhere",
    database: "pareto-anywhere",
    raddecTable: "raddec",
    dynambTable: "dynamb"
};

// ----- Exit gracefully if the optional dependency is not found -----
let BarnaclesTDS;
try {
  BarnaclesTDS = require('barnacles-tds');
}
catch(err) {
  console.log('This script requires barnacles-tds.  Install with:');
  console.log('\r\n    "npm install barnacles-tds"\r\n');
  return console.log('and then run this script again.');
}
// -------------------------------------------------------------------

let pa = new ParetoAnywhere();
pa.barnacles.addInterface(BarnaclesTDS, BARNACLES_TDS_OPTIONS);
```


Contributing
------------

Discover [how to contribute](CONTRIBUTING.md) to this open source project which upholds a standard [code of conduct](CODE_OF_CONDUCT.md).


Security
--------

Consult our [security policy](SECURITY.md) for best practices using this open source software and to report vulnerabilities.


License
-------

MIT License

Copyright (c) 2024 [reelyActive](https://www.reelyactive.com)

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR 
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, 
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE 
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER 
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, 
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN 
THE SOFTWARE.