var express = require('express'),
request = require('request'),
app = express(),
loki = require('lokijs'),
fs = require('fs'),
rbush = require('rbush'),
turf = require('turf'),
bodyParser = require('body-parser'),
helmet = require('helmet'),
queryString= require('query-string'),
urlPattern = require('url-pattern'),
connectivityData,
connectivityDataOperational;

var datasetName = process.argv[2] || "Cortland";

console.log("Using " + datasetName);

var db = new loki('cache.db');
var tree = rbush(9);
var treeOperational = rbush(9);
var grid = db.addCollection('grid', {
	indices: ['id', 'asset_id'],
	unique: ['id']
});
var gridOperational = db.addCollection('gridOperational', {
	indices: ['id', 'asset_id'],
	unique: ['id']
});

// Read the connectivity data.
fs.readFile('public/' + datasetName + '/connectivity.json', 'utf8', function (err, data) {
	if (err) throw err;
	connectivityData = JSON.parse(data);
	console.log("Read normal state connectivity data.");
});
fs.readFile('public/' + datasetName + '/connectivity_asop.json', 'utf8', function (err, data) {
	if (err) throw err;
	connectivityDataOperational = JSON.parse(data);
	console.log("Read operational state connectivity data.");
});

app.use(bodyParser.text());
app.use(bodyParser.json());
app.use(helmet());

var listenPort = process.env.PORT || 3000;

function extractExtent(url) {
	// Helper function that decodes a bounding box url with "left", "right" etc parameters
	// defining the bounds, turning it into an extent array using turf.
	var fc = {
		type: "FeatureCollection",
		features: []
	};
	
	var urlObj = queryString.parse(queryString.extract(url));

	var left = Number(urlObj.left), 
	right = Number(urlObj.right), 
	bottom = Number(urlObj.bottom), 
	top = Number(urlObj.top);
	
	var f = turf.lineString([[left, bottom], [right, top]]);
	fc.features.push(f);
	
	return turf.bbox(fc);
}

function processBboxRequest(req, res, state) {
	// Helper function for the bbox requests handled by createBboxEndpoints.
	var targetGrid, targetTree;
	
	switch(state) {
		case "normal":
			targetGrid = grid;
			targetTree = tree;
			break;
		case "operational":
			targetGrid = gridOperational;
			targetTree = treeOperational;
			break;
		default:
			console.log("Invalid state found (" + state + "), using default.");
			targetGrid = grid;
			targetTree = tree;
			break;
	}
	
	var extent = extractExtent(req.url);

	var features = [];
	
	var result = targetTree.search({
		minX: extent[0],
		minY: extent[1],
		maxX: extent[2],
		maxY: extent[3]
	});
	
	result.forEach(function(aResult) {
		var rec = targetGrid.find({ id: aResult.id });
		if (typeof rec[0] == "undefined" || rec[0] == null)
			console.log("Got bad feature at " + aResult.id);
		features.push(rec[0]);
	})
	
	var results = {
		type: "FeatureCollection",
		features: features
	};
	
	res.end(JSON.stringify(results));
}

function createBboxEndpoints() {
	// Creates service endpoints for retrieving feature data by bounds. Data can be of a specific state, but
	// in reality can only be "normal" or "operational" at this stage.
	function handleRequest(req, res) {
		console.log("Handling " + req.url);
		var pattern = new urlPattern(
		  '/v1/collections/:state/grid/spatial-query/bbox-interacts*'
		);
		
		var results = pattern.match(req.url);
		
		processBboxRequest(req, res, results.state);
	}
	
	app.get('/v1/collections/*/grid/spatial-query/bbox-interacts*', handleRequest);
}

app.post('/load', function (req, res) {
	// Redirects load POST requests to the powerflow service running on port 3100.
	console.log("Received " + req.method + " load request.");

	if (typeof req.body == "undefined") {
		console.log("Bad request, no content body.");
		res.writeHead(400);
		res.write("Error: No body content in request.");
		res.end();
	}
	else {
		console.log("Handling " + req.url);
		//console.log(req.body);
		//var url = 'http://ec2-52-0-154-128.compute-1.amazonaws.com:3000' + req.path;
		var url = 'http://localhost:3100' + req.path;
		console.log("Making POST request to " + url);

		request.post({
			url: url,
			body: req.body,
			headers: {
				'content-type' : 'text/plain',
				'data-type' : 'json'
			}
		}, function(err, remoteResponse, remoteBody) {
			console.log("Got PF response");
			if (err) { 
				return res.status(500).end('Error'); 
			}

			res.end(remoteBody);
		});
	}
});

function nodeString(aNodeId, targetConnectivity) {
	// For a given node id, returns a descriptive string based on all the features at that node location.
	var nodeData = targetConnectivity.nodes_to_geoms[aNodeId];
	
	var fStr = "";
	
	nodeData.geom_ids.forEach(function(geomId) {
		var results = grid.find({ id: geomId });
		
		//console.log(results);
		
		var aFeature = results[0];
		
		if (aFeature != null && typeof aFeature != "undefined")
			fStr += aFeature.properties.type + " " + geomId + " ";
	})
	
	return fStr;
}

function extractTX(aNodeId, targetConnectivity, targetGrid) {
	// For a given node id, returns a transformer feature (if any at that node).
	var nodeData = targetConnectivity.nodes_to_geoms[aNodeId];
	var tx;
	
	if (typeof nodeData == "undefined") {
		console.log("Could not find node data for " + aNodeId);
		return;
	}
	
	nodeData.geom_ids.forEach(function(geomId) {
		var results = targetGrid.find({ id: geomId });
		
		//console.log(results);
		
		var aFeature = results[0];
		
		if (aFeature != null && typeof aFeature != "undefined" && aFeature.properties.type.includes("eo_power_xfrmr_inst"))
			tx = aFeature;
	})
	
	return tx;
}

function extractConsumer(aNodeId, targetConnectivity, targetGrid) {
	// For a given node id, returns an energy consumer feature (if any at that node).
	var nodeData = targetConnectivity.nodes_to_geoms[aNodeId];
	var consumer;
	
	if (typeof nodeData == "undefined") {
		console.log("Could not find node data for " + aNodeId);
		return;
	}
	
	nodeData.geom_ids.forEach(function(geomId) {
		var results = targetGrid.find({ id: geomId });
		
		//console.log(results);
		
		var aFeature = results[0];
		
		//if (aFeature != null && typeof aFeature != "undefined" && (aFeature.properties.type.includes("eo_energy_consumer") || aFeature.properties.type.includes("eo_light")))
		if (aFeature != null && typeof aFeature != "undefined" && aFeature.properties.type.includes("eo_energy_consumer"))
			consumer = aFeature;
	})
	
	return consumer;
}

function traverseNodeTree(aNodeId, targetConnectivity, targetGrid, indent, parentTX, result) {
	// Helper function that recursively traverses the active connectivity tree starting at aChildNodeId
	// given node id. Returns a JSON object listing all the transformers and energy consumers found during
	// the traversal as well as fake powerflow data associated with each.
	var aNode = targetConnectivity.nodes_to_geoms[aNodeId];
	
	if (typeof aNode == "undefined") {
		console.log("Could not traverse node " + aNodeId);
		return;
	}
	
	if (typeof result == "undefined")
		result = {};
	
	if (typeof indent == "undefined")
		indent = 0;
	else
		indent++;
	
	var tx = extractTX(aNodeId, targetConnectivity, targetGrid);
	var nStr;
	var consumer = extractConsumer(aNodeId, targetConnectivity, targetGrid);
	
	if (typeof tx != "undefined") {
		if (typeof result[tx.asset_id] == "undefined")
			result[tx.asset_id] = {};
		
		nStr = nodeString(aNodeId, targetConnectivity);
	}
	else
		tx = parentTX;
	
	if (typeof consumer != "undefined") {
		var phasing = consumer.properties.phasing;
		if (typeof result[parentTX.asset_id]["consumers" + phasing] == "undefined") {
			result[parentTX.asset_id]["consumers" + phasing] = [];
		}

		result[parentTX.asset_id]["consumers" + phasing].push(consumer.asset_id);
	}
	
	//console.log(Array(indent + 1).join(" ") + aNodeId + " (" + nStr + ")");
	
	aNode.child_nodes.forEach(function(aChildNodeId) {
		traverseNodeTree(aChildNodeId, targetConnectivity, targetGrid, indent, tx, result);
	})
	
	if (typeof aNode.connected_tx != "undefined") {
		traverseNodeTree(aNode.connected_tx, targetConnectivity, targetGrid, indent, tx, result);
	}
	
	return result;
}

function findConnectedConsumers(aTXFeature, targetConnectivity, targetGrid) {
	var geomId = aTXFeature.id;
	var nodeId = targetConnectivity.geoms_to_nodes[geomId];
	var results = traverseNodeTree(nodeId, targetConnectivity, targetGrid);
	
	return results;
}

function createTXModel(tx) {
	// Helper function that takes a TX feature and creates a Transformer definition string conforming to
	// an OpenDSS model.
	var props = tx.properties;
	var bus1 = "SourceBus";
	var hs_voltage = props.source_voltage;
	var ls_voltage = props.load_voltage;
	
	var volts = hs_voltage.split(" ");
	
	if (volts[1] == "kV")
		hs_voltage = volts[0];
	

	volts = ls_voltage.split(" ");
	if (volts[1] == "V")
		ls_voltage = Number(volts[0]) / 1000;
	
	total_apparent_power = props.total_apparent_power;
	
	var pw = total_apparent_power.split(" ");
	
	var nextBus = "LS_" + props.asset_id;
	
	if (pw[1] == "kVA")
		total_apparent_power = pw[0];
	
	if (total_apparent_power == "-1 W") {
		// There was no value in the source data, set it to a default.
		console.log("TX " + props.asset_id + " had bad value for total apparent power, setting to default (30)...");
		total_apparent_power = "30";
	}
	
	var pfStr = "New Transformer." + props.asset_id + " Buses=[" + bus1 + "," + nextBus + "] Conns=[Wye,Wye] kVs=[" + hs_voltage + "," + ls_voltage + "] kVA=" + total_apparent_power + "\n";
	
	return {
		bus: nextBus,
		sourceBus: bus1,
		pfString: pfStr
	};
}

function createConsumerModel(consumer, sourceBus, consumerPower) {
	// Helper function that takes a consumer feature and creates a Load definition string conforming to
	// an OpenDSS model. The sourceBus parameter is the OpenDSS bus that the load is connected to and
	// consumerPower is the kW load that this consumer is adding.
	var props = consumer.properties;
	var phasing = props.phasing;
	var appendix = "";
	
	if (typeof sourceBus == "undefined")
		sourceBus = "foobar";
	
	switch(phasing) {
		case "A":
			appendix = ".1";
			break;
		case "B":
			appendix = ".2";
			break;
		case "C":
			appendix = ".3";
			break;
		case "AB":
			appendix = ".12";
			break;
		case "BC":
			appendix = ".23";
			break;
		case "AC":
			appendix = ".13";
			break;
		case "ABC":
			appendix = "";
			break;
		default:
			console.log("Got unknown phasing: " + phasing);
			break;
	}
	
	var loadName = props.asset_id + "_" + phasing;
	var pfStr = "New Load." + loadName + " Bus1=" + sourceBus + appendix + " kV=0.12 kW=" + consumerPower + " PF=.95\n";
	
	return {
		bus: sourceBus,
		pfString: pfStr
	};
}

function extractPFModel(aNodeId, nextBus, processedElements, consumerPower, targetConnectivity, targetGrid) {
	var pfStr = "";
	var aNode = targetConnectivity.nodes_to_geoms[aNodeId];
	
	if (typeof aNode == "undefined") {
		console.log("Could not find a node for " + aNodeId);
		return pfStr;
	}
	
	var tx = extractTX(aNodeId, targetConnectivity, targetGrid);
	var consumer = extractConsumer(aNodeId, targetConnectivity, targetGrid);
	
	if (typeof tx != "undefined") {
		var txData = createTXModel(tx);
		// If we detect a TX, we create a PF string for it and set the bus data so that subsequent loads 
		// will be using that bus.
		nextBus = txData.bus;
		
		if (typeof processedElements.transformers[tx.asset_id] == "undefined") {
			// Haven't seen this TX before, add it to script.
			processedElements.transformers[tx.asset_id] = {
				sourceBus: txData.sourceBus,
				nextBus: txData.bus
			};
			pfStr += txData.pfString;
		}
	}
	
	if (typeof consumer != "undefined") {
		var consumerData = createConsumerModel(consumer, nextBus, consumerPower);
		
		if (typeof processedElements.consumers[consumer.asset_id] == "undefined") {
			// Haven't seen this TX before, add it to script.
			processedElements.consumers[consumer.asset_id] = {
				sourceBus: consumerData.bus
			};
			pfStr += consumerData.pfString;
		}
	}
	
	// Traverse the nodes first.
	aNode.child_nodes.forEach(function(childNodeId) {
		pfStr += extractPFModel(childNodeId, nextBus, processedElements, consumerPower, targetConnectivity, targetGrid);
	})
	
	// Also traverse the transformer.
	if (typeof aNode.connected_tx != "undefined") {
		pfStr += extractPFModel(aNode.connected_tx, nextBus, processedElements, consumerPower, targetConnectivity, targetGrid);
	}
	
	return pfStr;
}

function createPowerFlowModel(aTXFeature, consumerPower, targetConnectivity, targetGrid) {
	var resultStr = "";
	var geomId = aTXFeature.id;
	var nodeData = targetConnectivity.geoms_to_nodes[geomId];
	
	resultStr += "clear\n";
	resultStr += "New Circuit.Powerflow\n";
	resultStr += "Edit Vsource.Source BasekV=13.2\n";
	
	var processedElements = {
		transformers: {},
		consumers: {}, 
		resultStr: ""
	}

	if (typeof nodeData != "undefined") {
		nodeData.forEach(function(nodeId) {
			resultStr += extractPFModel(nodeId, null, processedElements, consumerPower, targetConnectivity, targetGrid);
		});
	}
	
	//console.log(processedElements);
	//console.log(resultStr);
	
	processedElements.resultStr = resultStr;

	return processedElements;
}

function submitPF(pfModel, returnData, res) {
	// Makes a call to the powerflow service.
	var url = 'http://localhost:3100/load';
	console.log("Making POST request to " + url);
	
	function lookupTXFromBus(bus) {
		var foundTX;
		
		for (var property in pfModel.transformers) {
			if (pfModel.transformers.hasOwnProperty(property)) {
				if (pfModel.transformers[property].nextBus.toUpperCase() == bus.toUpperCase()) {
					foundTX = property;
				}
			}
		}
		
		return foundTX;
	}

	request.post({
		url: url,
		body: pfModel.resultStr,
		headers: {
			'content-type' : 'text/plain',
			'data-type' : 'json'
		}
	}, function(err, remoteResponse, remoteBody) {
		console.log("Got PF response");
		if (err) { 
			return res.status(500).end('Error'); 
		}
		//console.log(remoteBody);
		var pfResults = JSON.parse(remoteBody).data;
		
		//console.log(pfResults);
		
		var voltages = pfResults.voltages;
		var sqrt3 = Math.sqrt(3);
		
		voltages.forEach(function(vData) {
			var bus = vData.Bus;
			var txData = lookupTXFromBus(bus);
			var mag1 = vData.Magnitude1 * sqrt3;
			var mag2 = vData.Magnitude2 * sqrt3;
			var mag3 = vData.Magnitude3 * sqrt3;
			
			if (typeof txData != "undefined")
				returnData.transformers[txData].voltages = [mag1, mag2, mag3];
		});
		
		var losses = pfResults.losses;
		
		//console.log(losses);
		
		losses.forEach(function(lossData) {
			var elem = lossData.Element;
			var params = elem.split(".");
			var txID;
			
			if (params[0] == "Transformer")
				txID = params[1];
			
			if (typeof txID != "undefined") {
				var realLoss = lossData["Total(W)"];
				var varLoss = lossData["Total(var)"];
				
				var rTX = returnData.transformers[txID]
				
				if (typeof rTX != "undefined") {
					rTX["power_losses"] = {
						realLoss: realLoss,
						varLoss: varLoss
					}
				}
			}
		});

		res.write(JSON.stringify(returnData));
		res.status(200).end();
	});
}

function performTraceout(req, res, assetId, consumerPower, state) {
	// Helper function called by the normal and operational showvoltage requests.
	var targetGrid, targetConnectivity;
	
	if (typeof assetId == "undefined" || assetId == "") {
		res.status(422).end();
	}
	else if (typeof consumerPower == "undefined" || consumerPower == "")
		res.status(422).end();
	else {
		switch(state) {
			case "normal":
				console.log("Setting target to normal state.");
				targetGrid = grid;
				targetConnectivity = connectivityData;
				break;
			case "operational":
				console.log("Setting target to operational state.");
				targetGrid = gridOperational;
				targetConnectivity = connectivityDataOperational;
				break;
			default:
				console.log("Got unknown state - using default of normal.")
				targetGrid = grid;
				targetConnectivity = connectivityData;
				break;
		}
		
		console.log("Searching " + targetGrid.name + " for asset " + assetId + " in state " + state);
		var results = targetGrid.find({ asset_id: Number(assetId) });
		
		if (results.length == 0)
			res.status(404).end();
		else {
			// Check the feature is actually a transformer.
			var aTx = results[0];
			if (aTx.properties.type.includes("eo_power_xfrmr")) {
				var returnData = {
					transformers: {}
				}

				var geomId = aTx.id;
				var nodeId = targetConnectivity.geoms_to_nodes[geomId];
				
				var connectedConsumers = findConnectedConsumers(aTx, targetConnectivity, targetGrid);
				//console.log(connectedConsumers);
				
				returnData.transformers = connectedConsumers;
				
				var pfData = createPowerFlowModel(aTx, consumerPower, targetConnectivity, targetGrid);
				console.log(pfData.resultStr);
				
				submitPF(pfData, returnData, res);
			}
			else {
				res.status(404).end();
			}
		}
	}
}

function retrieveTX(req, res, state) {
	// Helper function for the gettx normal and operational calls.
	var url = req.url;
	var urlObj = queryString.parse(queryString.extract(url));
	var assetId;

	console.log("Received " + req.method + " gettx request (" + url + ".");
	
	if (typeof urlObj.asset_id == "undefined")
		// asset_id is mandatory.
		res.status(422).end();
	else {
		assetId = urlObj.asset_id;
	}
	
	var targetGrid;
	
	switch(state) {
		case "normal":
			targetGrid = grid;
			break;
		case "operational":
			targetGrid = gridOperational;
			break;
		default:
			console.log("Unknown state: " + state + ", using defaults...");
			targetGrid = grid;
			break;
	}
	
	if (typeof assetId != "undefined") {
		var rec = targetGrid.find({ asset_id: Number(assetId) });
		
		if (rec.length == 0) {
			res.status(404).end();
		}
		else {
			res.write(JSON.stringify(rec));
			res.status(200).end();
		}
	}
	else
		res.status(422).end();
}

app.get('/*/gettx*', function(req, res) {
	var pattern = new urlPattern("/:state/gettx*");
	var results = pattern.match(req.url);
	retrieveTX(req, res, results.state);
});

function getVoltages(req, res, state) {
	// Helper function for the normal and operational showtxvoltages calls.
	var url = req.url;
	var urlObj = queryString.parse(queryString.extract(url));
	console.log(urlObj);
	console.log("Received " + req.method + " showvoltages request (" + url + ".");

	var assetId, consumerPower;
	
	if (typeof urlObj.asset_id == "undefined" || urlObj.asset_id === null) {
		// asset_id is mandatory.
		res.status(422).end();
		return;
	}
	else {
		assetId = urlObj.asset_id;

		if ("consumer_power" in urlObj) {
			consumerPower = urlObj.consumer_power;

			if (typeof consumerPower == "undefined" || consumerPower === null) {
				// If the consumer_power is used it must have a value.
				console.log("Consumer power was not set, aborting.");
				res.status(422).end();
				return;
			}
			else if (isNaN(Number(consumerPower))) {
				// The value of consumerPower must be a number.
				console.log("The value for consumer power was not a number (" + consumerPower + ")");
				res.status(422).end();
				return;
			}
		}
		else {
			console.log("Setting consumer power to default value of 7.6kW");
			consumerPower = 7.6;
		}
	}
		
	console.log("Asset ID = " + assetId + " consumerPower = " + consumerPower);
	
	performTraceout(req, res, assetId, consumerPower, state);
}

app.get('/*/showtxvoltages*', function(req, res) {
	var pattern = new urlPattern("/:state/showtxvoltages*");
	var results = pattern.match(req.url);
	getVoltages(req, res, results.state);
});

app.use(express.static(__dirname + '/public'));

app.listen(listenPort, function () {
	console.log('Connectivity server app listening on port ' + listenPort + '!');
	
	// Load data.
 
	console.log("Loading normal state data...");	
	var geoData = JSON.parse(fs.readFileSync('public/' + datasetName + '/data.geojson', 'utf8'));
	console.log("Loading operational state data...");	
	var geoDataOperational = JSON.parse(fs.readFileSync('public/' + datasetName + '/data_asop.geojson', 'utf8'));
	
	geoData.features.forEach(function(aFeature) {
		// Insert into Loki.
		
		if (typeof aFeature != "undefined" || aFeature != null) {
			grid.insert(aFeature);
			
			// Create the R-tree index.
			var bbox = turf.bbox(aFeature);
			tree.insert({
				minX: bbox[0],
				minY: bbox[1],
				maxX: bbox[2],
				maxY: bbox[3],
				id: aFeature.id
			});
		}
		else
			console.log("Got a null feature - skipping...");
	});
	
	geoDataOperational.features.forEach(function(aFeature) {
		// Insert into Loki.
		
		if (typeof aFeature != "undefined" || aFeature != null) {
		
			gridOperational.insert(aFeature);
			
			// Create the R-tree index.
			var bbox = turf.bbox(aFeature);
			treeOperational.insert({
				minX: bbox[0],
				minY: bbox[1],
				maxX: bbox[2],
				maxY: bbox[3],
				id: aFeature.id
			});
		}
		else
			console.log("Got a null feature - skipping...");
	});
	
	console.log("Got collection " + db.getCollection('grid').name + " with " + db.getCollection('grid').count() + " records.");
	console.log("Got collection " + db.getCollection('gridOperational').name + " with " + db.getCollection('gridOperational').count() + " records.");
});

createBboxEndpoints();
