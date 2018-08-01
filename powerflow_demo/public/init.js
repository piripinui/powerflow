var sessionToken,
satelliteOptions = {
	"mapType" : "satellite",
	"language" : "gb-GB",
	"region" : "GB",
	"overlay" : false,
	"scale" : "scaleFactor1x",
	"layerTypes" : ["layerRoadmap", "layerStreetview"]
},
roadOptions = {
	"mapType" : "satellite",
	"language" : "gb-GB",
	"region" : "GB",
	"layerTypes" : ["layerRoadmap"],
	"overlay" : "true",
	"scale" : "scaleFactor1x"
},
streetviewOptions = {
	"mapType" : "streetview",
	"language" : "gb-GB",
	"region" : "GB"
},
requestOptions = {
	"mapType" : "roadmap",
	"language" : "gb-GB",
	"region" : "GB",
	"layerTypes" : ["layerRoadmap", "layerStreetview"],
	"overlay" : true,
	"scale" : "scaleFactor1x",
	"styles" : [{
			"stylers" : [{
					"hue" : "#000000"
				}, {
					"saturation" : -20
				}
			]
		}, {
			"featureType" : "road",
			"elementType" : "geometry",
			"stylers" : [{
					"lightness" : 100
				}, {
					"visibility" : "simplified"
				}
			]
		}, {
			"featureType" : "water",
			"stylers" : [{
					"color" : "#000000"
				}
			]
		}, {
			"featureType" : "landscape.natural.landcover",
			"stylers" : [{
					"color" : "#808080"
				}
			]
		}, {
			"featureType" : "poi.park",
			"stylers" : [{
					"color" : "#808080"
				}
			]
		}, {
			"featureType" : "road.arterial",
			"elementType" : "labels.text.fill"
		}
	]
},
apiKey = 'put your api key here',
satelliteSessionToken,
roadSessionToken,
streetviewSessionToken,
streetviewPanos, streetviewMetadata,
panorama;

function getSession(options, maptype) {
	var dfd = $.Deferred();

	$.ajax({
		url : "https://www.googleapis.com/tile/v1/createSession?key=" + apiKey,
		type : "POST",
		data : JSON.stringify(options),
		contentType : "application/json; charset=utf-8",
		dataType : "json",
		success : function (data) {
			console.log("Session token request succeeded");
			var d = new Date(0); // The 0 there is the key, which sets the date to the epoch

			switch (maptype) {
				case 'satellite': {
						satelliteSessionToken = data.session;
						console.log("Satellite session: " + satelliteSessionToken);
						d.setUTCSeconds(data.expiry);
						console.log("Satellite session expiry: " + data.expiry +" (" + d + ")")
						break;
					}
				case 'roadmap': {
						roadSessionToken = data.session;
						console.log("Road session: " + roadSessionToken);
						break;
					}
				case 'streetview': {
						streetviewSessionToken = data.session;
						console.log("Streetview session: " + streetviewSessionToken);
					}
			}
			dfd.resolve();
		}
	});

	return dfd.promise();
}

function getSatelliteSession() {
	return getSession(satelliteOptions, 'satellite');
}

function getRoadSession() {
	return getSession(roadOptions, 'roadmap');
}

function getStreetviewSession() {
	return getSession(streetviewOptions, 'streetview');
}

function updateAttribution(map) {
	var extent = map.getView().calculateExtent(map.getSize());
	var projectedExtent = ol.proj.transformExtent(extent, 'EPSG:3857', 'EPSG:4326');

	console.log(projectedExtent);

	$.ajax({
		url : "https://www.googleapis.com/tile/v1/viewport?session=" + satelliteSessionToken + "&zoom=" + map.getView().getZoom() + "&north=" + projectedExtent[3] + "&south=" + projectedExtent[1] + "&east=" + projectedExtent[2] + "&west=" + projectedExtent[0] + "&key=" + apiKey,
		type : "GET",
		success : function (data) {
			$('#satellite span').text("Satellite: " + data.copyright);
		}
	})
}

function getPanoId(locations) {
	var dfd = $.Deferred();
	
	$.ajax({
		url : "https://www.googleapis.com/tile/v1/streetview/panoIds?key=" + apiKey + "&session=" + streetviewSessionToken,
		type : "POST",
		data : JSON.stringify(locations),
		contentType : "application/json; charset=utf-8",
		dataType : "json",
		success : function (data) {
			console.log("Streetview pano id request succeeded");
			console.log(data);
			streetviewPanos = data;
			dfd.resolve();
		}
	});
	
	return dfd.promise();
}

function getStreetviewMetadata() {
	var dfd = $.Deferred();
	
	$.ajax({
		url : "https://www.googleapis.com/tile/v1/streetview/metadata?key=" + apiKey + "&panoId=" + streetviewPanos.panoIds[0] + "&session=" + streetviewSessionToken,
		type : "GET",
		contentType : "application/json; charset=utf-8",
		dataType : "json",
		success : function (data) {
			console.log("Streetview metadata request request succeeded");
			console.log(data);
			streetviewMetadata = data;
			dfd.resolve();
		}
	});
	
	return dfd.promise();
}

function toDataURL(url, callback) {
	var xhr = new XMLHttpRequest();
	xhr.onload = function() {
		var reader = new FileReader();
		reader.onloadend = function() {
		  callback(reader.result);
		}
		reader.readAsDataURL(xhr.response);
	};
	xhr.open('GET', url);
	xhr.responseType = 'blob';
	xhr.send();
}

function getStreetviewTiles() {
	toDataURL("https://www.googleapis.com/tile/v1/streetview/tiles/2/0/0?key=" + apiKey + "&panoId=" + streetviewPanos.panoIds[0] + "&session=" + streetviewSessionToken, function(dataUrl) {
		$("#streetview").attr("src", dataUrl);
	});
}

function makeAddressString() {
	// Constructs a string for display from address components.
	var addressString = "";
	
	for (var i = streetviewMetadata.addressComponents.length - 2; i >= 0; i--) {
		var aComponent = streetviewMetadata.addressComponents[i];
		
		if (i > 0) {
			addressString += aComponent.longName + ",\n";
		}
		else {
			addressString += aComponent.longName;
		}
	}
	
	return addressString;
}

function getTileUrl(pano, zoom, tileX, tileY) {
	return "/streetviewtile?zoom=" + zoom + "&tilex=" + tileX + "&tiley=" + tileY;
}

function getPanoramaData(pano) {
	//console.log("Getting panorama...");
	return {
	  location: {
		pano: getPano(),  
		description: makeAddressString(),
		latLng: new google.maps.LatLng(streetviewMetadata.lat, streetviewMetadata.lng)
	  },
	  links: streetviewMetadata.links,
	  copyright: 'Imagery ' + streetviewMetadata.copyright,
	  tiles: {
		tileSize: new google.maps.Size(streetviewMetadata.tileWidth, streetviewMetadata.tileHeight),
		worldSize: new google.maps.Size(streetviewMetadata.imageWidth, streetviewMetadata.imageHeight),
		centerHeading: getHeading(),
		getTileUrl: getTileUrl
	  }
	};
}

function getPano() {
	return streetviewMetadata.panoId;
}

function getHeading() {
	return streetviewMetadata.heading;
}

function initPanorama() {
	//if (typeof panorama == "undefined") {
		/* if (typeof panorama != "undefined") {
			// tear everything down before redefining it.
			
			$("#street-view").remove()
			$("#panel").append('<div id="street-view"></div>');
			delete panorama;
		} */
		console.log("Creating panorama...");
		panorama = new google.maps.StreetViewPanorama(
			document.getElementById('street-view'),
			{
				pano: getPano()
			});
			
		// Register a provider for the custom panorama.
		panorama.registerPanoProvider(function(pano) {
			return getPanoramaData(pano);
		});
		
		panorama.addListener('links_changed', function() {
		  if (panorama.getPano() === getPano()) {
			panorama.getLinks().push({
			  description: makeAddressString(),
			  heading: getHeading(),
			  pano: getPano()
			});
		  }
		  else {
			  console.log("Panorama ids do not match");
		  }
		});
	/* }
	else {
		console.log("Resetting panorama...");
		panorama.setPano(streetviewMetadata.panoId);
		panorama.setPosition(new google.maps.LatLng(streetviewMetadata.lat, streetviewMetadata.lng));
		panorama.setPov({
			heading: streetviewMetadata.heading,
			pitch: 0
		});
		panorama.registerPanoProvider(function(pano) {
			return getPanoramaData(pano);
		});
	} */  
}

function init() {
	var attribution = new ol.control.Attribution({
			collapsible : false
		});

	getSatelliteSession()
	.then(function () {

		var satelliteSource = new ol.source.XYZ({
				url : 'https://www.googleapis.com/tile/v1/tiles/{z}/{x}/{y}?session=' + satelliteSessionToken + '&key=' + apiKey
			});

		console.log("Created Google tile source using " + satelliteSource.getUrls()[0]);

		var map = new ol.Map({
				layers : [
					new ol.layer.Tile({
						source : satelliteSource
					})
				],
				controls : ol.control.defaults({
					attribution : false
				}).extend([attribution]),
				target : 'map',
				view : new ol.View({
					center : [0, 0],
					zoom : 2
				})
			});
			
		$.ajax({
			url : "/initstreetviewsession",
			type : "GET",
			contentType : "application/json; charset=utf-8",
			dataType : "json",
			success : function (data) {
				console.log("Streetview session established.");
				streetviewSessionToken = data;
			}
		});

		map.on("moveend", function (e) {
			console.log("Map moved");
			updateAttribution(e.map);
		});
		
		map.on('singleclick', function(evt) {      
            var latLon = ol.proj.transform(evt.coordinate, 'EPSG:3857', 'EPSG:4326');                                           
			console.log("Click event: " + latLon[0] + ", " + latLon[1]);	
			
			var locations = {
				'locations' : [
					{
						'lat' : latLon[1],
						'lng' : latLon[0]						
					}
				],
				'radius' : 50
			};
			
			$.ajax({
				url : "/initstreetview?lat=" + latLon[1] + "&lon=" + latLon[0],
				type : "GET",
				contentType : "application/json; charset=utf-8",
				dataType : "json",
				success : function (data) {
					console.log("Tile server initialisation succeeded");
					streetviewMetadata = data;
					
					console.log("Pano id = " + streetviewMetadata.panoId + ", lat = " + streetviewMetadata.lat + ", lon = " + streetviewMetadata.lng);
					console.log("Request coordinates = " + latLon[1] + ", " + latLon[0]);
					
					initPanorama();
				}
			});
		});  

		function checkSize() {
			var small = map.getSize()[0] < 600;
			attribution.setCollapsible(small);
			attribution.setCollapsed(small);
		}

		window.addEventListener('resize', checkSize);
		checkSize();
	});
	
	getStreetviewSession()
	.then(function() {
		console.log("Got streetview session token.");
	});
}