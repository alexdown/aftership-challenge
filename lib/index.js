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

			console.log('-->got id: ' + tracking_number);

			var USERID = '293SELFE2299';

			var options = {
			  host: 'production.shippingapis.com',
			  path: '/ShippingAPITest.dll?API=TrackV2&XML=<TrackRequest%20USERID="' + USERID+ '"><TrackID%20ID="' + tracking_number + '"></TrackID></TrackRequest>'
			};

			console.log('-->calling usps...');

			var http_callback = function(response) {
				var str = '';

				console.log('-->waiting for usps answer...');

				response.on('data', function (chunk) {
					console.log('-->receiving data...');
					str += chunk;
				});

				response.on('end', function () {
					console.log('-->usps answered: ' + str);
					tracking_result.checkpoints = [];

					xml2js.parseString(str, function (err, result) {
					    console.log(util.inspect(result, false, null));

						if (result['TrackResponse']['TrackInfo'].length != 1) {
							throw new Error('-->requested for 1 ID, got ' + result['TrackResponse']['TrackInfo'].length +' results');
						}
						if (result['TrackResponse']['TrackInfo'][0]['$'].ID != tracking_number) {
							throw new Error('-->requested to track ID ' + tracking_number +', but usps replied with info for ' + result['TrackResponse']['TrackInfo'][0]['$'].ID);
						}
						if (result['TrackResponse']['TrackInfo'][0]['TrackSummary'] === undefined || result['TrackResponse']['TrackInfo'][0]['TrackSummary'] === null) {
							throw new Error( '-->usps response for tracking ID ' + result['TrackResponse']['TrackInfo'][0]['$'].ID + ' does not have a track summary (i.e. a "final status")' );
						}

						if (result['TrackResponse']['TrackInfo'][0]['TrackSummary'] !== undefined && result['TrackResponse']['TrackInfo'][0]['TrackSummary'] !== null) {
							console.log('-->good data!');

							var summary = result['TrackResponse']['TrackInfo'][0]['TrackSummary'][0];
							if (summary.indexOf('Your item was delivered at ')>-1) {
								console.log('-->delivered :)');

								var dateEnd = summary.indexOf(' in ');
								var timeStart = summary.indexOf(' at ') + ' at '.length;

								tracking_result.checkpoints.push({
									country_name: '',
									message: 'Delivered',
									checkpoint_time: Date.parse( summary.substring(timeStart, dateEnd) ).toISOString().substring(0, 19) //need to remove the timezone info. eh :/
								});
							} else {
								console.log('-->not delivered :/');

								tracking_result.checkpoints.push({
									country_name: '',
									message: 'Exception',
									checkpoint_time: (new Date()).toISOString()
								});
							}

							console.dir(tracking_result);
							test_callback(null, tracking_result);
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

			console.log('-->got id: ' + tracking_number);

			var options = {
			  host: 'app3.hongkongpost.hk',
			  path: '/CGI/mt/e_detail2.jsp?mail_type=parcel_ouw&tracknbr=' + tracking_number + '&localno=' + tracking_number
			};

			console.log('-->calling hkpost...');

			var http_callback = function(response) {
				var str = '';

				console.log('-->waiting for hkpost answer...');

				response.on('data', function (chunk) {
					console.log('-->receiving data...');
					str += chunk;
				});

				response.on('end', function () {
					console.log('-->hkpost answered (not showing str, it\'s an html page, so waay too long');
					tracking_result.checkpoints = [];

					jsdom.env(
						str,
						["http://code.jquery.com/jquery.js"],
						function (errors, window) {
							if (errors !== null) {
								console.log('-->not delivered :/');

								tracking_result.checkpoints.push({
									country_name: '',
									message: 'Exception',
									checkpoint_time: (new Date()).toISOString()
								});
							} else {
								console.log('-->tracking history :)');

								var t = window.$("#clfContent table:last-of-type");
								//console.log("-->table content:", t[0].innerHTML);

								t.children().each(function() {
									console.log('--->checking item value, it is: ' + window.$(this).children()[0].innerHTML);
									if ('Date #' === window.$(this).children()[0].innerHTML ) {
										console.log('-->skipping first item...');
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
							test_callback(null, tracking_result);
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

			console.log('-->got id: ' + tracking_number);

			//TODO what is tracking? a JSESSIONID? can be random but unique?
			var options = {
			  host: 'www.dpd.co.uk',
			  path: '/esgServer/shipping/delivery/?parcelCode=' + tracking_number + '&_=1397736324927',
			  headers: {
			  	'Cookie': 'tracking=828a77e0-c621-11e3-b90c-b7856aeb2619',
			  	'Accept': 'application/json, text/javascript, */*; q=0.01'
			  }
			};

			console.log('-->calling dpduk...');

			var http_callback = function(response) {
				var str = '';

				console.log('-->waiting for dpduk answer...');

				response.on('data', function (chunk) {
					console.log('-->receiving data...');
					str += chunk;
				});

				response.on('end', function () {
					console.log('-->dpduk answered (not showing str, it\'s an html page, so waay too long');
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
					test_callback(null, tracking_result);
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

console.dir(Courier.usps('9102999999302024326992', function(err, result){
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
console.dir(Courier.hkpost('CP889331175HK', function(err, result){
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
console.dir(Courier.dpduk('15502370264989N', function(err, result){

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
