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

/*
 * this does pass the test.. simple sync return
 *	

				tracking_result.checkpoints = [];
				tracking_result.checkpoints.push({ 
					country_name: '',
	       			message: 'Delivered',
	       			checkpoint_time: '2014-01-15T12:57:00' 
	       		});
	       		console.dir(tracking_result);

	       		return tracking_result;
*/

/*
 * this does not pass the test.. seems that the callback mess everything up
 *		
			setTimeout(function () {
				tracking_result.checkpoints = [];
				tracking_result.checkpoints.push({ 
					country_name: '',
	       			message: 'Delivered',
	       			checkpoint_time: '2014-01-15T12:57:00' 
	       		});
	       		console.dir(tracking_result);

	       		return tracking_result;
			}, 0);
*/


/*
 * real implementation.. async, because of the http.get
 */

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
					console.log('Courier | HKPost | hkpost answered (not showing str, it\'s an html page, so waay too long');
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

									tracking_result.checkpoints.push({
										country_name: countryCodesConversion[window.$(this).children()[1].innerHTML],
										message: window.$(this).children()[2].innerHTML,
										checkpoint_time: Date.parse( window.$(this).children()[0].innerHTML ).toISOString().substring(0, 19) //need to remove the timezone info. eh :/
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
			var datejs = require('datejs');
			var jsdom = require('jsdom');

			console.log('Courier | DPD UK | got id: ' + tracking_number);

			//the html tracking page is itself calling a ws that returns json, then showing results on page. I try to call the ws directly

			//TODO what is tracking? a JSESSIONID? can be random but unique? still haven't figured out... 
			//maybe now it works only becayse the "tracking" is a valid session on the server... how long before it'll expire?
			var options = {
			  host: 'www.dpd.co.uk',
			  path: '/esgServer/shipping/delivery/?parcelCode=' + tracking_number + '&_=1397736324927',
			  headers: {
			  	'Cookie': 'tracking=828a77e0-c621-11e3-b90c-b7856aeb2619',
			  	'Accept': 'application/json, text/javascript, */*; q=0.01'   //that's important. without this accept, it returns 406
			  }
			};

			console.log('Courier | DPD UK | calling dpduk...');

			var http_callback = function(response) {
				var str = '';

				console.log('Courier | DPD UK | waiting for dpduk answer...');

				response.on('data', function (chunk) {
					console.log('Courier | DPD UK | receiving data...');
					str += chunk;
				});

				response.on('end', function () {
					console.log('Courier | DPD UK | dpduk answered (not showing str, it\'s an html page, so waay too long');
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

			http.request(options, http_callback).end();
			//return tracking_result;

		};
	}

	module.exports = new Courier();
}());


//test run
/*
var should = require('should'),
	_ = require('underscore'),
	Courier = require('../lib/index');

console.dir(Courier.usps('9102999999302024326992', function(result){
				var usps = {
					checkpoints: [
						{
							country_name: '',
							message: 'Delivered',
							checkpoint_time: '2014-01-15T11:57:00'
						}
					]
				};

				result.should.eql(usps);
			}));
console.dir(Courier.hkpost('CP889331175HK', function(result){
				var hkpost = {
						checkpoints: [
							{
								country_name: 'HK',
								message: 'Item posted.',
								checkpoint_time: '2013-12-10T23:00:00'
							},
							{
								country_name: 'HK',
								message: 'In transit.',
								checkpoint_time: '2013-12-10T23:00:00'
							},
							{
								country_name: 'HK',
								message: 'Processed for departure.',
								checkpoint_time: '2013-12-12T23:00:00'
							},
							{
								country_name: 'HK',
								message: 'The item left Hong Kong for its destination on 19-Dec-2013 ',
								checkpoint_time: '2013-12-16T23:00:00'
							},
							{
								country_name: 'NZ',
								message: 'Arrived.',
								checkpoint_time: '2014-01-13T23:00:00'
							},
							{
								country_name: 'NZ',
								message: 'In transit.',
								checkpoint_time: '2014-01-13T23:00:00'
							},
							{
								country_name: 'NZ',
								message: 'Delivered.',
								checkpoint_time: '2014-01-14T23:00:00'
							}
						]
					};

				result.should.eql(hkpost);
			}));
console.dir(Courier.dpduk('15502370264989N', function(result){

				var dpduk = {'checkpoints': [
					{
						country_name: 'Hub 3 - Birmingham',
						message: 'We have your parcel, and it\'s on its way to your nearest depot',
						checkpoint_time: '2014-01-08T22:33:50'
					},
					{
						country_name: 'Hub 3 - Birmingham',
						message: 'We have your parcel, and it\'s on its way to your nearest depot',
						checkpoint_time: '2014-01-08T22:34:58'
					},
					{
						country_name: 'Hub 3 - Birmingham',
						message: 'Your parcel has left the United Kingdom and is on its way to Saudi Arabia',
						checkpoint_time: '2014-01-09T03:56:57'
					},
					{
						country_name: 'United Kingdom',
						message: 'The parcel is in transit on its way to its final destination.',
						checkpoint_time: '2014-01-09T22:34:00'
					},
					{
						country_name: 'Bahrain',
						message: 'Your parcel has arrived at the local delivery depot',
						checkpoint_time: '2014-01-10T09:39:00'
					},
					{
						country_name: 'Bahrain',
						message: 'The parcel is in transit on its way to its final destination.',
						checkpoint_time: '2014-01-10T13:45:00'
					},
					{
						country_name: 'Bahrain',
						message: 'The parcel is in transit on its way to its final destination.',
						checkpoint_time: '2014-01-12T13:17:00'
					},
					{
						country_name: 'Saudi Arabia',
						message: 'Your parcel has arrived at the local delivery depot',
						checkpoint_time: '2014-01-14T06:30:00'
					},
					{
						country_name: 'Saudi Arabia',
						message: 'Your parcel is at the local depot awaiting collection',
						checkpoint_time: '2014-01-14T21:18:00'
					},
					{
						country_name: 'Saudi Arabia',
						message: 'Your parcel is on the vehicle for delivery',
						checkpoint_time: '2014-01-15T08:34:00'
					},
					{
						country_name: 'Saudi Arabia',
						message: 'The parcel has been delivered, signed for by BILAL',
						checkpoint_time: '2014-01-15T19:23:00'
					}
				]
				};

				result.should.eql(dpduk);
			}));

*/
