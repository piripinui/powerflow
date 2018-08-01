function init() {
	var greyColor = [226, 225, 225, 0.8];
	var blackColor = [0, 0, 0, 0.8];
	var lineColor = [226, 225, 225, 1.0];
	
	var image = new ol.style.Circle({
			radius : 5,
			fill : null,
			stroke : new ol.style.Stroke({
				color : 'red',
				width : 1
			})
		});

	var rwoStyles = {
		'eo_cable_segment_inst.route_lv' : new ol.style.Style({
			stroke : new ol.style.Stroke({
				color : lineColor,
				width : 2
			})
		}),
		'eo_wire_segment_inst.route_lv' : new ol.style.Style({
			stroke : new ol.style.Stroke({
				color : lineColor,
				width : 2
			})
		}),
		'eo_wire_segment_inst.route_mv' : new ol.style.Style({
			stroke : new ol.style.Stroke({
				color : lineColor,
				width : 2
			})
		}),
		'eo_power_xfrmr_inst.load_location_lv' : new ol.style.Style({
			image : new ol.style.Circle({
				radius : 2,
				fill : new ol.style.Fill({
					color : greyColor
				}),
				stroke : new ol.style.Stroke({
					color : blackColor,
					width : 1
				})
			})
		}),
		'eo_power_xfrmr_inst.source_location_mv' : new ol.style.Style({
			image : new ol.style.RegularShape({
				fill : new ol.style.Fill({
					color : greyColor
				}),
				stroke : new ol.style.Stroke({
					color : blackColor,
					width : 1
				}),
				points : 3,
				radius : 10,
				rotation : Math.PI,
				angle : 0
			})
		}),
		'eo_isolating_eqpt_inst.connector_mv' : new ol.style.Style({
			stroke : new ol.style.Stroke({
				color : greyColor,
				width : 4
			})
		}),
		'eo_light.location_lv' : new ol.style.Style({
			image : new ol.style.Circle({
				radius : 5,
				fill : new ol.style.Fill({
					color : greyColor
				}),
				stroke : new ol.style.Stroke({
					color : blackColor,
					width : 1
				})
			})
		}),
		'eo_energy_consumer.location_lv' : new ol.style.Style({
			image : new ol.style.Circle({
				radius : 5,
				fill : new ol.style.Fill({
					color : greyColor
				}),
				stroke : new ol.style.Stroke({
					color : blackColor,
					width : 1
				})
			})
		})
	};

	var connectivityData, connectivityDataOperational;

	function getConnectivityData() {
		console.log("About to fetch connectivity data...");
		$.getJSON("Cortland/connectivity.json", function (json) {
			console.log("Setting JSON data...");
			connectivityData = json;
		});
	}
	
	function getOperationalConnectivityData() {
		console.log("About to fetch operational connectivity data...");
		$.getJSON("Cortland/connectivity_asop.json", function (json) {
			console.log("Setting operational JSON data...");
			connectivityDataOperational = json;
		});
	}
	
	function getState() {
		return $("#stateselection")[0].value;
	}
	
	$("#stateselection").change( function() {
        console.log("State was changed to " + getState());
		
		vectorSource.clear()
		featureOverlaySource.clear();
    });
	
	$("#txbutton").click( function() {
		var txID = $("#txname")[0].value;
        console.log("TX search initiated: " + txID);
		
		if (txID != "") {
			// Find and display it.

			var url = "/" + getState() + "/gettx?asset_id=" + txID;
			console.log("Requesting " + url);
			$.get(url, function(data) {
				console.log("Received data");
				var results = JSON.parse(data);
				
				if (results.length > 0) {
					// Select using the geometry id, not the asset id.
					doSelect(results[0].id, results[0].asset_id);
				}
			})
		}
    });

	getConnectivityData();
	getOperationalConnectivityData();

	var styleFunction = function (feature) {
		return rwoStyles[feature.getProperties().type];
	};

	var gridFormat = new ol.format.GeoJSON({
			featureProjection : 'EPSG:3857'
		});

	var vectorSource = new ol.source.Vector({
			strategy : function (extent, resolution) {
				var coord1 = ol.proj.transform([extent[0], extent[1]], 'EPSG:3857', 'EPSG:4326');
				var coord2 = ol.proj.transform([extent[2], extent[3]], 'EPSG:3857', 'EPSG:4326');

				return [[coord1[0], coord1[1], coord2[0], coord2[1]]];
			},
			loader : function (extent, resolution, proj) {
				console.log("Calling loader...");
				var url = '/v1/collections/' + getState() + '/grid/spatial-query/bbox-interacts?left=' + extent[0] + "&bottom=" + extent[1] + "&right=" + extent[2] + "&top=" + extent[3];

				var promise = $.ajax({
						url : url,
						type : 'GET'
					});

				promise.done(function (data) {
					var features = gridFormat.readFeatures(data, {
							dataProjection : 'EPSG:4326',
							featureProjection : 'EPSG:3857'
						});
					console.log("Collection call succeeded for " + url + " (" + features.length + " features)");

					vectorSource.addFeatures(features);

					console.log("Loader: Layer grid: loaded " + vectorSource.getFeatures().length + " features.");
				});

				promise.fail(function (jqXHR, textStatus, errorThrown) {
					console.log("Error: " + errorThrown);
				});
			}
		});

	var vectorLayer = new ol.layer.Vector({
			source : vectorSource,
			style : highlightStyleFunction
		});
		
	var highlightColor;
	var highlightConsumerColors = {};
	var highlightTXColors = {};
	
	function setHLColors(pfData) {
		var txHLColor;
		
		for (var txID in pfData.transformers) {
			if (pfData.transformers.hasOwnProperty(txID)) {
				var pfVals = pfData.transformers[txID];
				if (typeof pfVals != "undefined") {
					var voltIndex;
					var volts = "-999";
					var consumers;
					
					if (typeof pfVals != "undefined") {
						if (typeof pfVals["consumersA"] != "undefined") {
							// Got A phase consumers.
							consumers = pfVals["consumersA"];
							voltIndex = 0;
						}
						else if (typeof pfVals["consumersB"] != "undefined") {
							// Got B phase consumers.
							consumers = pfVals["consumersB"];
							voltIndex = 1;
						}
						else if (typeof pfVals["consumersC"] != "undefined") {
							// Got C phase consumers.
							consumers = pfVals["consumersC"];
							voltIndex = 2;
						}
						else if (typeof pfVals["consumersAB"] != "undefined") {
							// Got AB phase consumers.
							consumers = pfVals["consumersAB"];
							voltIndex = 0;
						}
						else if (typeof pfVals["consumersAC"] != "undefined") {
							// Got AC phase consumers.
							consumers = pfVals["consumersAC"];
							voltIndex = 0;
						}
						else if (typeof pfVals["consumersBC"] != "undefined") {
							// Got BC phase consumers.
							consumers = pfVals["consumersBC"];
							voltIndex = 1;
						}
						else if (typeof pfVals["consumersABC"] != "undefined") {
							// Got ABC phase consumers.
							consumers = pfVals["consumersABC"];
							voltIndex = 0;
						}
						else {
							// Probably a TX with no attached consumers.
							console.log("Did not recognise phase type...");
							console.log(pfVals);
						}
					}
					
					if (typeof voltIndex != "undefined") {
						volts = pfVals.voltages[voltIndex];
						//console.log("Volts for " + txID + " = " + volts);
						if (Number(volts) <= 100)
							txHLColor = "red";
						else if (Number(volts) <= 110)
							txHLColor = "orange";
						else if (Number(volts) <= 115)
							txHLColor = "brown";
						else
							txHLColor = "green";
					}
					
					highlightTXColors[txID] = txHLColor;
					
					if (typeof consumers != "undefined") {
						consumers.forEach(function(aConsumerId) {
							highlightConsumerColors[aConsumerId] = txHLColor;
						});
					}
				}
			}
		}
	}

	function highlightStyleFunction(feature, resolution) {
		var props = feature.getProperties();
		var id = props.asset_id;
		
		if (!props.type.includes("eo_energy_consumer") && !props.type.includes("eo_power_xfrmr")) {
			// If it's not a consumer or a tx, return normal style.
			return rwoStyles[feature.getProperties().type];
		}
		else if (props.type.includes("eo_energy_consumer") && typeof highlightConsumerColors[id] == "undefined") {
			// If it's a consumer but has no hl style, return normal style.
			return rwoStyles[feature.getProperties().type];
		}
		else if (props.type.includes("eo_power_xfrmr") && typeof highlightTXColors[id] == "undefined") {
			// If it's a tx but has no tx hl style, return normal style.
			return rwoStyles[feature.getProperties().type];
		}
		else {
			var txHLColor;
			if (props.type.includes("eo_power_xfrmr_inst")) {
				txHLColor = highlightTXColors[props.asset_id];
			}
			
			if (props.type == "eo_energy_consumer.location_lv") {
				var consumerHLColor = highlightConsumerColors[props.asset_id];
				
				if (typeof consumerHLColor == "undefined") {
					console.log("Got an undefined highlight color for " + props.asset_id);
					consumerHLColor = highlightColor;
				}
			}
			
			var highlightRwoStyles = {
				'eo_cable_segment_inst.route_lv' : new ol.style.Style({
					stroke : new ol.style.Stroke({
						color : [226, 225, 225, 0.5],
						width : 2
					})
				}),
				'eo_wire_segment_inst.route_lv' : new ol.style.Style({
					stroke : new ol.style.Stroke({
						color : [226, 225, 225, 0.5],
						width : 2
					})
				}),
				'eo_wire_segment_inst.route_mv' : new ol.style.Style({
					stroke : new ol.style.Stroke({
						color : [226, 225, 225, 0.5],
						width : 2
					})
				}),
				'eo_power_xfrmr_inst.load_location_lv' : new ol.style.Style({
					image : new ol.style.Circle({
						radius : 2,
						fill : new ol.style.Fill({
							color : txHLColor
						}),
						stroke : new ol.style.Stroke({
							color : 'black',
							width : 1
						})
					})
				}),
				'eo_isolating_eqpt_inst.connector_mv' : new ol.style.Style({
					stroke : new ol.style.Stroke({
						color : txHLColor,
						width : 4
					})
				}),
				'eo_power_xfrmr_inst.source_location_mv' : new ol.style.Style({
					image : new ol.style.RegularShape({
						fill : new ol.style.Fill({
							color : txHLColor
						}),
						stroke : new ol.style.Stroke({
							color : 'black',
							width : 1
						}),
						points : 3,
						radius : 10,
						rotation : Math.PI,
						angle : 0
					})
				}),
				'eo_light.location_lv' : new ol.style.Style({
					image : new ol.style.Circle({
						radius : 5,
						fill : new ol.style.Fill({
							color : [226, 225, 225, 0.5]
						}),
						stroke : new ol.style.Stroke({
							color : [226, 225, 225, 0.5],
							width : 1
						})
					})
				}),
				'eo_energy_consumer.location_lv' : new ol.style.Style({
					image : new ol.style.Circle({
						radius : 5,
						fill : new ol.style.Fill({
							color : consumerHLColor
						}),
						stroke : new ol.style.Stroke({
							color : 'black',
							width : 1
						})
					})
				})
			};
			
			var aStyle = highlightRwoStyles[props.type];
					
			return aStyle;
		}
	}

	var featureOverlaySource = new ol.source.Vector({});
	var featureOverlayLayer = new ol.layer.Vector({
			source : featureOverlaySource,
			style : highlightStyleFunction
		})

	var map = new ol.Map({
		layers : [
			new ol.layer.Tile({
				source : new ol.source.OSM()
			}),
			vectorLayer//,
			//featureOverlayLayer
		],
		target : 'map',
		controls : ol.control.defaults({
			attributionOptions : /** @type {olx.control.AttributionOptions} */({
				collapsible : false
			})
		}),
		view : new ol.View({
			center : ol.proj.transform([-76.180484, 42.601181], 'EPSG:4326', 'EPSG:3857'),
			zoom : 18
		})
	});

	var select = new ol.interaction.Select();
	var highlighted;

	function constructFeatureString(aFeature) {
		var str = "";

		var props = aFeature.getProperties();

		switch (props.type) {
		case "eo_power_xfrmr_inst.source_location_mv":
			var id = aFeature.getId();
			str = "Power Transformer (" + id + ")\n Source Location\nRating = " + props.source_voltage + " / " + props.load_voltage;
			str += "\nPhasing = " + props.phasing;
			str += "\nTotal Apparent Power = " + props.total_apparent_power;
			str += "\nAsset ID = " + props.asset_id;
			break;
		case "eo_power_xfrmr_inst.load_location_lv":
			var id = aFeature.getId();
			str = "Power Transformer (" + id + ")\n Load Location\nRating = " + props.source_voltage + " / " + props.load_voltage;
			str += "\nPhasing = " + props.phasing;
			str += "\nTotal Apparent Power = " + props.total_apparent_power;
			break;
		case "eo_energy_consumer.location_lv":
			var id = aFeature.getId();
			str = "Energy Consumer (" + id + ")";
			str += "\nPhasing = " + props.phasing + "\nNominal Voltage = " + props.nominal_voltage;
			break;
		case "eo_light.location_lv":
			var id = aFeature.getId();
			str = "Light (" + id + ")";
			str += "\nPhasing = " + props.phasing + "\nNominal Voltage = " + props.nominal_voltage;
			break;
		default:
			str = "Unknown (" + props.type + ")";
			break;
		}

		return str;
	}

	var graph = {
		name : "Root",
		childNodes : [],
		features: []
	}
	
	function getTargetConnectivityData() {
		var state = getState();
		var targetConnectivity;
		
		switch(state) {
			case "normal":
				targetConnectivity = connectivityData;
				break;
			case "operational":
				targetConnectivity = connectivityDataOperational;
				break;
			default:
				console.log("Could not determine the state, using defaults.");
				targetConnectivity = connectivityData;
				break;
		}
		
		return targetConnectivity;
	}
	
	function findNextTX(nodeId) {
		console.log("Searching node " + nodeId);
		var nodeData = getTargetConnectivityData().nodes_to_geoms[nodeId];
		var geomData = nodeData.geom_ids;
		var aTX;
		
		if (typeof geomData != "undefined") {
			// Do any of the geoms at this node correspond to a TX?
			geomData.forEach(function(nextGeomId) {
				
				var aFeature = vectorSource.getFeatureById(nextGeomId);
				
				if (aFeature != null) {
					var props = aFeature.getProperties();
					
					if (props.type.includes("eo_power_xfrmr")) {
						aTX = aFeature;
					}
				}
			});
		}
		
		if (aTX == null) {
			// Recursively search on the child nodes.
			nodeData.child_nodes.forEach(function(aChildNodeId) {
				if (aTX == null)
					aTX = findNextTX(aChildNodeId);
			})
		}
		
		return aTX;
	}
	
	function refreshMap() {
		vectorLayer.getSource().changed();
	}
	
	function doSelect(geomId, assetId) {

		var aFeature = vectorSource.getFeatureById(geomId);
		
		if (aFeature != null)
			console.log("Selected feature = " + aFeature.getProperties().type + " (" + geomId + ")");
		else {
			// This feature does not exist in the vector dataset, probably because there is no map representation
			// for it. Find the first downstream feature related to this and show that instead.
			console.log("Could not find the selected feature " + geomId);
			var nID = getTargetConnectivityData().geoms_to_nodes[geomId];
			if (typeof nID != "undefined")
				aFeature = findNextTX(nID[0]);
		}

		featureOverlaySource.clear();

		// Can only select point entities.

		
		var geom = aFeature.getGeometry();

		if (geom.getType() == "Point") {
			// Clear the record of what we're highlighting
			highlighted = [];
			graph = {
				name : 1,
				childNodes : [],
				features: []
			}
			
			// Reset the colors for consumers.
			highlightConsumerColors = {};
			highlightTXColors = {};

			// Get the node id of the selected geometry.
			var nodeId = getTargetConnectivityData().geoms_to_nodes[geomId];
			// Get the data associated with this node, including other geometries and parent and child nodes.
			var nodeData = getTargetConnectivityData().nodes_to_geoms[nodeId];
			
			graph.name = nodeId;
			graph.features.push(aFeature);

			// Show selected object in sidebar.
			var fStr = constructFeatureString(aFeature);
			$("#selection")[0].innerText = fStr;
			
			var powerVal = $("#power input")[0].value;
			console.log("Power value set to " + powerVal);
			
			console.log("Retrieving voltages for " + getState());
			
			$.get(getState() + "/showtxvoltages?asset_id=" + assetId + "&consumer_power=" + powerVal, function(data) {
				console.log("Received query response:");
				pfData = JSON.parse(data);
				// Populate the colors for the consumers before rendering them.
				setHLColors(pfData);
				
				refreshMap();
				
				//highlightPowerFlowResults(pfData);
				// Add the root asset to the feature overlay and highlight it.
				//highLightGeom(id);
			
				// Now traverse down from the top of the tree (which is the selected object's parent).
				/* nodeData.child_nodes.forEach(function(aChildNodeId) {
					highlightDownstreamAssets(aChildNodeId, graph);
				}); */
				
				// If this a TX it will have a "connected_tx" value representing the node of the load side of the TX. 
				/* if (typeof nodeData["connected_tx"] != "undefined")
					highlightDownstreamAssets(nodeData.connected_tx, graph); */
			});
			
			console.log(graph);
			printGraph(graph);

			//createD3Graph();
			//var dssScript = createDSSModel(graph, true);
			//console.log(dssScript.script);
			//submitPowerflow(dssScript);
		}
	}

	select.on('select', function (e) {
		//console.log(e);

		var selectedFeature = e.selected[0];
		
		if (typeof selectedFeature == "undefined")
			return;
		
		var id = selectedFeature.getId();
		
		doSelect(id, selectedFeature.getProperties().asset_id);
	});

	map.addInteraction(select);
	
	function nodeString(aNodeId) {
		var nodeData = getTargetConnectivityData().nodes_to_geoms[aNodeId];
		
		var fStr = "";
		
		nodeData.geom_ids.forEach(function(geomId) {
			var aFeature = vectorSource.getFeatureById(geomId);
			
			if (aFeature != null && typeof aFeature != "undefined")
				fStr += aFeature.getProperties().type + " " + geomId + " ";
		})
		
		return fStr;
	}
	
	function printGraph(graph, indent) {
		if (typeof indent == "undefined")
			indent = 1;
		else 
			indent++;
		
		console.log(Array(indent + 1).join(" ") + graph.name + " (" + nodeString(graph.name) + ") ");
		
		graph.childNodes.forEach(function(aGraph) {
			printGraph(aGraph, indent);
		})
	}

	function highLightGeom(geomId) {
		var aFeature = vectorSource.getFeatureById(geomId);

		// The feature may not be in the map because of the bbox strategy, so only proceed if we find it.

		if (aFeature == null || typeof aFeature == "undefined")
			return;

		var props = aFeature.getProperties();

		//console.log("Highlighting " + props.type + " : " + geomId + " (" + props.asset_id + ")");
		featureOverlaySource.addFeature(aFeature);

		if (!highlighted.includes(geomId))
			highlighted.push(geomId);
	}

	function highlightDownstreamAssets(nodeId, parentNode) {
		var nodeData = getTargetConnectivityData().nodes_to_geoms[nodeId];
		
		if (typeof nodeData == "undefined") {
			console.log("Could not find data for node id " + nodeId);
			return;
		}
		
		var geomIds = nodeData.geom_ids;
		
		// Create a new node.
		var thisNode = {
			name: nodeId,
			childNodes: [],
			features: []
		};
		
		// Populate the features.
		geomIds.forEach(function(aGeomId) {
			var aFeature = vectorSource.getFeatureById(aGeomId);
			
			if (typeof aFeature != "undefined") {
				thisNode.features.push(aFeature);
				highLightGeom(aGeomId);
			}
		});
		
		// Set the parent.
		parentNode.childNodes.push(thisNode);

		// Process the children recursively.
		nodeData.child_nodes.forEach(function(aChildNodeId) {
			highlightDownstreamAssets(aChildNodeId, thisNode);
		});
		
		// If this a TX it will have a "connected_tx" value representing the node of the load side of the TX. 
		if (typeof nodeData["connected_tx"] != "undefined")
			highlightDownstreamAssets(nodeData.connected_tx, thisNode);
	}
	
	function createDSSModel(graph, atRoot, dssScript, sourceBus) {
		var nextBus;
		
		if (typeof dssScript == "undefined")
			dssScript = {
				script: "",
				busses: {},
				loads: {}
			};
		var bus1, bus2, hs_voltage, ls_voltage, total_apparent_power;
		
		if (atRoot) {
			dssScript.script += "clear\n";
			dssScript.script += "New Circuit.Powerflow\n";
		}
		
		function addTX(props, dssScript, sourceBus) {
			var nextBus;
			var dssScriptLine = "";
			
			hs_voltage = props.source_voltage;
			ls_voltage = props.load_voltage;
			
			var volts = hs_voltage.split(" ");
			
			if (volts[1] == "kV")
				hs_voltage = volts[0];
			
			// The data from Cortland doesn't make sense. There are transformers connected only to other transformers but they have a voltage stepdown e.g. 13.2kV to 120V, as
			// if they are connected to houses. Shouldn't they be 13.2kV/13.2kV?
			volts = ls_voltage.split(" ");
			if (volts[1] == "V")
				ls_voltage = Number(volts[0]) / 1000;
			
			total_apparent_power = props.total_apparent_power;
			var pw = total_apparent_power.split(" ");
			
			if (pw[1] == "kVA")
				total_apparent_power = pw[0];
			
			if (atRoot || typeof sourceBus == "undefined") {
				scriptSourceVoltage = hs_voltage;
				dssScriptLine += "Edit Vsource.Source BasekV=" + hs_voltage + "\n";
				bus1 = "SourceBus";
			}
			else {
				//bus1 = sourceBus;
				bus1 = "SourceBus";
			}
			
			nextBus = "LS_" + props.asset_id;
			dssScriptLine += "New Transformer." + props.asset_id + " Buses=[" + bus1 + "," + nextBus + "] Conns=[Wye,Wye] kVs=[" + hs_voltage + "," + ls_voltage + "] kVA=" + total_apparent_power + "\n";
			
			dssScript.busses[bus1.toUpperCase()] = props.asset_id;
			dssScript.busses[nextBus.toUpperCase()] = props.asset_id;
			dssScript.script += dssScriptLine;
			
			return nextBus;
		}
		
		function addConsumer(props) {
			var phasing = props.phasing;
			var appendix = "";
			
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
				case "ABC":
					appendix = "";
					break;
				default:
					console.log("Got unknown phasing: " + phasing);
					break;
			}
			
			var loadName = props.asset_id + "_" + phasing;
			var dssScriptLine = "New Load." + loadName + " Bus1=" + sourceBus + appendix + " kV=0.12 kW=7.6 PF=.95\n";
			
			dssScript.loads[loadName.toUpperCase()] = props.asset_id;
			
			return dssScriptLine;
		}
		
		function processNode(aChild) {
			console.log("Processing child node " + aChild.name + " (" + nodeString(aChild.name) + ")");
			aChild.features.forEach(function(aFeature) {
				if (aFeature == null)
					return;
				var props = aFeature.getProperties();
				
				switch(props.type) {
					case "eo_power_xfrmr_inst.source_location_mv":
						var txIdent = "New Transformer." + props.asset_id;
						
						// Don't add TX definitions more than once.
						if (!dssScript.script.includes(txIdent)) {
							nextBus = addTX(props, dssScript, sourceBus);
						}
						if (typeof nextBus == "undefined")
							nextBus = sourceBus;
						break;
					case "eo_power_xfrmr_inst.load_location_lv":
						if (typeof nextBus == "undefined")
							nextBus = sourceBus;
						break;
					case "eo_energy_consumer.location_lv":
						dssScript.script += addConsumer(props);
						break;
					default:
						console.log("Unknown entity: " + props.type);
						if (typeof nextBus == "undefined")
							nextBus = sourceBus;
						break;
				}
			});
		}
		
		processNode(graph);
		
		// Now process the children.
		
		graph.childNodes.forEach(function(aChild) {
			dssScript = createDSSModel(aChild, false, dssScript, nextBus);
		});
		
		return dssScript;
	}
	
	function submitPowerflow(dssScript) {
	
		console.log("Submitting POST request...");
		console.log(dssScript.script);
		
		var success = function(data, status) {
			console.log("POST request was successful.");
			var voltages = data.data.voltages;
			
			voltages.forEach(function(aVoltage) {
				var bus = aVoltage.Bus.toUpperCase();
				var assetId = dssScript.busses[bus];
				var sqrt3 = Math.sqrt(3);
				console.log("Voltage at TX " + assetId + " (" + bus + ") = " + (Number(aVoltage.Magnitude1) * sqrt3) + ", " + (Number(aVoltage.Magnitude2) * sqrt3) + ", " + (Number(aVoltage.Magnitude3) * sqrt3));
			})
		}
		var failure = function(err, status) {
			console.log("POST request failed: " + err.statusText + ", " + status);
		}
		
		var postSettings = {
			url: '/load',
			data: dssScript.script,
			contentType: 'text/plain',
			success: success,
			error: failure,
			dataType: 'json'
		};
		
		$.post(postSettings);
	}	

	function createD3Graph() {
		// Set the dimensions and margins of the diagram
		var margin = {
			top : 20,
			right : 90,
			bottom : 30,
			left : 90
		},
		width = 350 - margin.left - margin.right,
		height = 300 - margin.top - margin.bottom;

		// If an svg element exists already, delete it.
		var svg = d3.select('svg');

		if (typeof svg != "undefined")
			svg.remove();

		// append the svg object to the body of the page
		// appends a 'group' element to 'svg'
		// moves the 'group' element to the top left margin
		svg = d3.select("#svgDiv").append("svg")
			.attr("width", width + margin.right + margin.left)
			.attr("height", height + margin.top + margin.bottom)
			.attr("id", "svgcontainer")
			.append("g")
			.attr("transform", "translate("
				 + margin.left + "," + margin.top + ")");

		var g = d3.select("g"),
		transform = d3.zoomIdentity;

		svg.call(d3.zoom()
			.scaleExtent([1 / 100, 8])
			.on("zoom", zoomed));

		svg.call(d3.drag()
			.on("drag", dragged));

		function zoomed() {
			g.attr("transform", d3.event.transform);
		}

		function dragged(d) {
			d3.select(this).attr("cx", d.x = d3.event.x).attr("cy", d.y = d3.event.y);
		}

		var i = 0,
		duration = 750,
		root;

		// declares a tree layout and assigns the size
		var treemap = d3.tree().size([height, width]);

		// Assigns parent, children, height, depth
		root = d3.hierarchy(graph, function (d) {
				return d.children;
			});
		root.x0 = height / 2;
		root.y0 = 0;

		// Collapse after the second level
		root.data.childNodes.forEach(collapse);

		update(root);

		// Collapse the node and all it's children
		function collapse(d) {
			if (d.children) {
				d._children = d.children
					d._children.forEach(collapse)
					d.children = null
			}
		}

		function update(source) {

			// Assigns the x and y position for the nodes
			var treeData = treemap(root);

			// Compute the new tree layout.
			var nodes = treeData.descendants(),
			links = treeData.descendants().slice(1);

			// Normalize for fixed-depth.
			nodes.forEach(function (d) {
				d.y = d.depth * 180
			});

			// ****************** Nodes section ***************************

			// Update the nodes...
			var node = svg.selectAll('g.node')
				.data(nodes, function (d) {
					return d.id || (d.id = ++i);
				});

			// Enter any new modes at the parent's previous position.
			var nodeEnter = node.enter().append('g')
				.attr('class', 'node')
				.attr("transform", function (d) {
					return "translate(" + source.y0 + "," + source.x0 + ")";
				})
				.on('click', click);

			// Add Circle for the nodes
			nodeEnter.append('circle')
			.attr('class', 'node')
			.attr('r', 1e-6)
			.style("fill", function (d) {
				return d._children ? "lightsteelblue" : "#fff";
			});

			// Add labels for the nodes
			var txt = nodeEnter.append('text')
				.attr("dy", "2em")
				.attr("x", function (d) {
					return d.children || d._children ? -13 : 13;
				})
				.attr("text-anchor", function (d) {
					return "start";
				})
				.append('tspan')
				.attr('x', '10')
				.attr('dy', '1.2em')
				.text(function (d) {
					return d.data.name;//.split("\n")[0];
				});

			// UPDATE
			var nodeUpdate = nodeEnter.merge(node);

			// Transition to the proper position for the node
			nodeUpdate.transition()
			.duration(duration)
			.attr("transform", function (d) {
				return "translate(" + d.y + "," + d.x + ")";
			});

			// Update the node attributes and style
			nodeUpdate.select('circle.node')
			.attr('r', 10)
			.style("fill", function (d) {
				return d._children ? "lightsteelblue" : "#fff";
			})
			.attr('cursor', 'pointer');

			// Remove any exiting nodes
			var nodeExit = node.exit().transition()
				.duration(duration)
				.attr("transform", function (d) {
					return "translate(" + source.y + "," + source.x + ")";
				})
				.remove();

			// On exit reduce the node circles size to 0
			nodeExit.select('circle')
			.attr('r', 1e-6);

			// On exit reduce the opacity of text labels
			nodeExit.select('text')
			.style('fill-opacity', 1e-6);

			// ****************** links section ***************************

			// Update the links...
			var link = svg.selectAll('path.link')
				.data(links, function (d) {
					return d.id;
				});

			// Enter any new links at the parent's previous position.
			var linkEnter = link.enter().insert('path', "g")
				.attr("class", "link")
				.attr('d', function (d) {
					var o = {
						x : source.x0,
						y : source.y0
					}
					return diagonal(o, o)
				});

			// UPDATE
			var linkUpdate = linkEnter.merge(link);

			// Transition back to the parent element position
			linkUpdate.transition()
			.duration(duration)
			.attr('d', function (d) {
				return diagonal(d, d.parent)
			});

			// Remove any exiting links
			var linkExit = link.exit().transition()
				.duration(duration)
				.attr('d', function (d) {
					var o = {
						x : source.x,
						y : source.y
					}
					return diagonal(o, o)
				})
				.remove();

			// Store the old positions for transition.
			nodes.forEach(function (d) {
				d.x0 = d.x;
				d.y0 = d.y;
			});

			// Creates a curved (diagonal) path from parent to the child nodes
			function diagonal(s, d) {

				path = `M ${s.y} ${s.x}
					C ${(s.y + d.y) / 2} ${s.x},
					  ${(s.y + d.y) / 2} ${d.x},
					  ${d.y} ${d.x}`

					return path
			}

			// Toggle children on click.
			function click(d) {
				if (d.children) {
					d._children = d.children;
					d.children = null;
				} else {
					d.children = d._children;
					d._children = null;
				}
				update(d);
			}
		}
	}
}