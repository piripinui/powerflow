# powerflow

A demonstration server that provide services for retrieving connectivity (derived from Smallworld Electric Office using the Cortland dataset). Consists of three parts:

* A nodejs front end server running on port 3000 that provides the services used by external consumers
* A nodejs proxy server on port 3100 that responds to requests from the front end server and passes them onto the OpenDSS server
* An .NET [OpenDSS](https://sourceforge.net/p/electricdss/wiki/Home/) server on port 3001 that does powerflow based on connectivity

To run the service, run the two node servers and the .NET server by executing 'node server.js' in the respective directories. The .NET server can be started at the command prompt using the executable in ims-cim/bin/powerflow.exe e.g.

`powerflow c:\foo\bar\ims-cim\data\main.dss c:\foo\bar\ims-cim\data`