//TODO logs are poor. use a logging package that allows to enable/disable logging, provides log levels, timestamp of entries, configuration of the output, async...

(function() {
	function Courier() {
		this.usps = function(tracking_number, test_callback) {
			var tracking_result = {}; // save your result to this object
			
			console.log('');
 			console.log('*************** USPS ***************');
 			console.log('');

			var http = require('http');
			var xml2js = require('xml2js');
			var util = require('util');
			var datejs = require('datejs');

			console.log('Courier | USPS | got id: ' + tracking_number);

			//use USPS web API (https://www.usps.com/business/web-tools-apis/delivery-information.htm). needs account (register on the website) for test, + write to support to enable it for production

			//this of course should be externalised, part of the account settings
			var USERID = '293SELFE2299';

			//use ShippingAPITest... needs change to production before golive. Maybe a set of configs based on environment would be nice?
			var options = {
			  host: 'production.shippingapis.com',
			  path: '/ShippingAPITest.dll?API=TrackV2&XML=<TrackRequest%20USERID="' + USERID+ '"><TrackID%20ID="' + tracking_number + '"></TrackID></TrackRequest>'
			};

			console.log('Courier | USPS | calling usps...');

			var http_callback = function(response) {
				var str = '';
	
				console.log('Courier | USPS | waiting for usps answer...');

				//get response data
				response.on('data', function (chunk) {
					console.log('Courier | USPS | receiving data...');
					str += chunk;
				});

				response.on('error', function(e) {
					console.log('Courier | USPS | problem with request: ' + e.message);
				});

				//response received. do parsing
				response.on('end', function () {
					console.log('Courier | USPS | usps answered: ' + str);
					tracking_result.checkpoints = [];

					//it's xml, let's parse it into a js obj (parse it's not 1-1 as tag attributes are mapped into their own obj properties..)
					xml2js.parseString(str, function (err, result) {
					    console.log(util.inspect(result, false, null));

					    //some error & unusual conditions checking
						if (result['TrackResponse']['TrackInfo'].length != 1) {
							throw new Error('Courier | USPS | requested for 1 ID, got ' + result['TrackResponse']['TrackInfo'].length +' results');
						}
						if (result['TrackResponse']['TrackInfo'][0]['$'].ID != tracking_number) {
							throw new Error('Courier | USPS | requested to track ID ' + tracking_number +', but usps replied with info for ' + result['TrackResponse']['TrackInfo'][0]['$'].ID);
						}
						if (result['TrackResponse']['TrackInfo'][0]['TrackSummary'] === undefined || result['TrackResponse']['TrackInfo'][0]['TrackSummary'] === null) {
							throw new Error( 'Courier | USPS | usps response for tracking ID ' + result['TrackResponse']['TrackInfo'][0]['$'].ID + ' does not have a track summary (i.e. a "final status")' );
						}

						if (result['TrackResponse']['TrackInfo'][0]['TrackSummary'] !== undefined && result['TrackResponse']['TrackInfo'][0]['TrackSummary'] !== null) {
							console.log('Courier | USPS | good data!');

							//if we have a summary, let's read that & ignore transit history
							var summary = result['TrackResponse']['TrackInfo'][0]['TrackSummary'][0];
							if (summary.indexOf('Your item was delivered at ')>-1) {
								console.log('Courier | USPS | delivered :)');

								var dateEnd = summary.indexOf(' in ');
								var timeStart = summary.indexOf(' at ') + ' at '.length;

								tracking_result.checkpoints.push({
									country_name: '',
									message: 'Delivered',
									checkpoint_time: Date.parse( summary.substring(timeStart, dateEnd) ).toISOString().substring(0, 19) //need to remove the timezone info. eh :/
								});
							} else {
								console.log('Courier | USPS | not delivered :/');

								tracking_result.checkpoints.push({
									country_name: '',
									message: 'Exception',
									checkpoint_time: (new Date()).toISOString()
								});
							}

							console.dir(tracking_result);
							test_callback(tracking_result);
						}
					});

				});
			}

			http.request(options, http_callback).end();
			//return tracking_result;

		};

		this.hkpost = function(tracking_number, test_callback) {
			var tracking_result = {}; // save your result to this object

			console.log('');
 			console.log('*************** HKPOST *************');
 			console.log('');

			var http = require('http');
			var datejs = require('datejs');
			var jsdom = require('jsdom');

			//TODO would be nice to put this in an external json or properties files, and handle multiple versions of a country name (e.g. "Hong Kong" vs "Hong Kong SAR", or when scraping websites not in english...)
			var countryCodesConversion = {};
			countryCodesConversion['Hong Kong'] = 'HK';
			countryCodesConversion['New Zealand'] = 'NZ';

			console.log('Courier | HKPost | got id: ' + tracking_number);

			//there is no API, so I'm going to call the URL of the tracking page & parse the html

			var options = {
			  host: 'app3.hongkongpost.hk',
			  path: '/CGI/mt/e_detail2.jsp?mail_type=parcel_ouw&tracknbr=' + tracking_number + '&localno=' + tracking_number
			};

			console.log('Courier | HKPost | calling hkpost...');

			var http_callback = function(response) {
				var str = '';

				console.log('Courier | HKPost | waiting for hkpost answer...');

				response.on('data', function (chunk) {
					console.log('Courier | HKPost | receiving data...');
					str += chunk;
				});

				response.on('end', function () {
					console.log('Courier | HKPost | hkpost answered (not showing str, it\'s an html page, so waay too long)');
					tracking_result.checkpoints = [];

					//create the page DOM so I can use jquery selectors to easily iterate on the items of the transit history
					jsdom.env(
						str,
						["http://code.jquery.com/jquery.js"],
						function (errors, window) {
							console.log('Courier | HKPost | html parsing done...');

							//any error, means I can't read the data so I return a failure
							if (errors !== null) {
								console.log('Courier | HKPost | not delivered :/');

								tracking_result.checkpoints.push({
									country_name: '',
									message: 'Exception',
									checkpoint_time: (new Date()).toISOString()
								});
							} else {
								console.log('Courier | HKPost | tracking history :)');

								//get the data table
								var t = window.$("#clfContent table:last-of-type");
								//console.log("Courier | HKPost | table content:", t[0].innerHTML);

								//iterate on each row. discard the first, as it's header (in its own td, not on a th... bah :)
								t.children().each(function() {
									console.log('Courier | HKPost | checking item value, it is: ' + window.$(this).children()[0].innerHTML);
									if ('Date #' === window.$(this).children()[0].innerHTML ) {
										console.log('Courier | HKPost | skipping first item...');
										return;
									}

									var tmpDateTime = Date.parse( window.$(this).children()[0].innerHTML );
									tmpDateTime = new Date(Date.UTC(tmpDateTime.getFullYear(), tmpDateTime.getMonth(), tmpDateTime.getDate(), 0, 0, 0));

									tracking_result.checkpoints.push({
										country_name: countryCodesConversion[window.$(this).children()[1].innerHTML],
										message: window.$(this).children()[2].innerHTML,
										checkpoint_time: tmpDateTime.toISOString().substring(0, 19)  //need to remove the timezone info. eh :/
									});
								});
							}

							console.dir(tracking_result);
							test_callback(tracking_result);
						}
					);

				});
			}

			http.request(options, http_callback).end();
			//return tracking_result;

		};

		this.dpduk = function(tracking_number, test_callback) {
			var tracking_result = {}; // save your result to this object

			console.log('');
 			console.log('*************** DPDUK *************');
 			console.log('');

			var http = require('http');

			console.log('Courier | DPD UK | got id: ' + tracking_number);

			//the html tracking page is itself calling a ws that returns json, then showing results on page. I try to call the ws directly.
			//to do that I need a searchSession. How to retrieve that? 
			//I do what the page itself is doing: calling a specific url to retrieve the parcelCode and searchSession (the page is then passing these values to itself in the url querystring... I just use them)

			var options1 = {
				host: 'www.dpd.co.uk',
				path: '/esgServer/shipping/shipment/_/parcel/?filter=id&searchCriteria=deliveryReference%3D' + tracking_number + '%26postcode%3D&searchPage=0&searchPageSize=25'
			};
		
			var http_callback1 = function(response) {
				var str = '';

				console.log('Courier | DPD UK | retrieving searchSession...');

				response.on('data', function (chunk) {
					console.log('Courier | DPD UK | receiving data...');
					str += chunk;
				});

				response.on('end', function () {
					console.log('Courier | DPD UK | here the params of your search session ' + str);
					//I now use JSON.parse(str).obj.searchSession to call the ws that return shipment tracking

					var options2 = {
						host: 'www.dpd.co.uk',
						path: '/esgServer/shipping/delivery/?parcelCode=' + tracking_number,
						headers: {
					  		'Cookie': 'tracking=' + JSON.parse(str).obj.searchSession,
					  		'Accept': 'application/json, text/javascript'   //that's important. without this accept, it returns 406
						}
					};

					console.log('Courier | DPD UK | calling dpduk...');

					var http_callback2 = function(response) {
						var str = '';

						console.log('Courier | DPD UK | waiting for dpduk answer...');

						response.on('data', function (chunk) {
							console.log('Courier | DPD UK | receiving data...');
							str += chunk;
						});

						response.on('end', function () {
							console.log('Courier | DPD UK | dpduk answered ' + str);
							tracking_result.checkpoints = [];

							jsonResult = JSON.parse(str);
							//console.dir(jsonResult);

							for (var i=jsonResult.obj.trackingEvent.length-1; i > -1; i--) {
								//console.dir(jsonResult.obj.trackingEvent[i]);

								tracking_result.checkpoints.push({
									country_name: jsonResult.obj.trackingEvent[i].trackingEventLocation,
									message: jsonResult.obj.trackingEvent[i].trackingEventStatus,
									checkpoint_time: jsonResult.obj.trackingEvent[i].trackingEventDate.substring(0, 19) //need to remove the timezone info. eh :/
								});
							}

							console.dir(tracking_result);
							test_callback(tracking_result);
						});
					}

					http.request(options2, http_callback2).end();
					//return tracking_result;

				});
			}

			http.request(options1, http_callback1).end();
		};

	}

	module.exports = new Courier();
}());

