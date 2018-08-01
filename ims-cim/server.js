var express = require('express'),
request = require('request'),
app = express(),
fs = require('fs'),
async = require('async'),
childProcess = require('child_process'),
bodyParser = require('body-parser'),
csv=require('csvtojson'),
helmet = require('helmet');

var resultDir = process.cwd() + "\\data";

var listenPort = process.env.PORT || 3100;

app.use(express.static(__dirname + '/public'));

app.use(bodyParser.text({limit: '50mb'}));
app.use(bodyParser.json({limit: '50mb'}));

var q = async.queue(function(task, callback) {	
	var res = task.response;
	console.log("Processing request form queue...");
	// Write the content out as a file.
	fs.writeFile("data/main.dss", task.content, function(err) {
		if(err) {
			return console.log(err);
		}
		
		request.get('http://localhost:3001/load')
		.on('response', function (response) {
			console.log("Got response from OpenDSS server...");
			//console.log(response);
			
			// Read voltage CSV file and return back to calling client.
			var pfResult = {
				voltages: [],
				currents: [],
				powers: [],
				losses: []
			};
			var resultFile = resultDir + "\\voltage.csv";
			console.log("Read data from " + resultFile);
			csv()
			.fromFile(resultFile)
			.on('json',(csvRow)=>{
				// Push the voltage results.
				pfResult.voltages.push(csvRow);
			})
			.on('done',(error)=>{
				resultFile = resultDir + "\\current.csv"
				csv()
				.fromFile(resultFile)
				.on('json',(csvRow)=>{
					// Push the current results.
					pfResult.currents.push(csvRow);
				})
				.on('done',(error)=>{
					resultFile = resultDir + "\\" + task.circuitName + "_EXP_POWERS.CSV";
					csv()
					.fromFile(resultFile)
					.on('json',(csvRow)=>{
						// Push the voltage results.
						pfResult.powers.push(csvRow);
					})
					.on('done', (error)=> {
						resultFile = resultDir + "\\losses.CSV";
						csv()
						.fromFile(resultFile)
						.on('json',(csvRow)=>{
							// Push the losses results.
							pfResult.losses.push(csvRow);
						})
						.on('done', (error) => {
							// Send results back.
							res.writeHead(200);
							var result = {
								data: pfResult
							};
							res.write(JSON.stringify(result));
							res.end();
							
							// Remove the result files.
							fs.unlink(resultDir + "\\voltage.csv", function() {	
								console.log("Deleted " + resultDir + "\\voltage.csv");
								fs.unlink(resultDir + "\\current.csv", function() {	
									console.log("Deleted " + resultDir + "\\current.csv");
									fs.unlink(resultDir + "\\" + task.circuitName + "_EXP_POWERS.CSV", function() {	
										console.log("Deleted " + resultDir + "\\" + task.circuitName + "_EXP_POWERS.CSV");	
										fs.unlink(resultDir + "\\losses.csv", function() {	
											console.log("Deleted " + resultDir + "\\losses.csv");
											callback();
										});
									});
								});
							});
						});
					});
				});
			});
		})
		.on('error', function(err) {
			console.log(err)
		});
	})
}, 1);

app.use(helmet());

app.post('/load', function(req, res) {
	console.log("Received " + req.method + " load request.");
	
	if (typeof req.body == "undefined") {
		console.log("Bad request, no content body.");
		res.writeHead(400);
		res.write("Error: No body content in request.");
		res.end();
	}
	else {
		console.log("POST request ok.");
		console.log(req.body);
		
		var regex = /New Circuit\.(.*?)/m;
		var match = regex.exec(req.body);
		console.log("Circuit = " + match[1]);
		
		// Create a queued job to process this request.
		var task = {
			circuitName: match[1],
			response: res,
			content: req.body
		};
		
		q.push(task);
	}
});

app.listen(listenPort, function () {
	console.log('powerflowserver app listening on port ' + listenPort + '!');
});
