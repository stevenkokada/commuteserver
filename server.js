const express = require('express');
const axios = require('axios');
const secret = require('./secret');

const app = express();

app.use(function(req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
});


const QUERY_FREQ_IN_MIN = 30;
const MINS_PER_HOUR = 60;
const HOURS_PER_DAY = 24;

const DUMMY_ENDPOINT = 'http://dummy.restapiexample.com/api/v1/employee';
const HERE_ENDPOINT = 'https://route.api.here.com/routing/7.2/calculateroute.json';

const addMinutes = function(date, minutes) {
	return new Date(date.getTime() + minutes * 60000);
}

const submitQuery = function(res) {

	//HARD CODED INPUTS
	const desiredDeparture = "20:22";
	const tolerance = "130";
	const waypoint0 = 'geo!52.5,13.4';
	const waypoint1 = 'geo!52.5,13.45';
	const start = "540 Page Street, San Francisco CA"
	const destination = "44 Tehama Street, San Francisco CA"

	// GET PARAM INPUTS
	// const desiredDeparture = req.params.desiredTime;
	// const tolerance = req.params.tolerance;
	// const tzoffset = req.params.timezoneOffset;
	// const start = req.params.startLocation;
	// const destination = req.params.endLocation;


	//	GEOCODING
    var geocoding_data = {};

    const deferred_start = $.get('https://geocoder.api.here.com/6.2/geocode.json',
    {app_id: '267f9NJSwzyCIx6hWBFZ' , app_code: "sytOu8Ybgls8UHnTlB_GOg", searchtext: start},
    function(data){
        const startCoord = data.Response.View[0].Result[0].Location.NavigationPosition[0];
        geocode_data['startLat'] = startCoord.Latitude;
        geocode_data['startLon'] = startCoord.Longitude;

        geocode_data['startWayPoint'] = "geo!" + String(startCoord.Latitude) + "," + String(startCoord.Longitude);

        });
    
    const deferred_end = $.get('https://geocoder.api.here.com/6.2/geocode.json',
    {app_id: '267f9NJSwzyCIx6hWBFZ' , app_code: "sytOu8Ybgls8UHnTlB_GOg", searchtext: destination},
    function(data){
        const endCoord = data.Response.View[0].Result[0].Location.NavigationPosition[0];
        geocode_data['endLat'] = endCoord.Latitude;
        geocode_data['endLon'] = endCoord.Longitude;
        geocode_data['endWayPoint'] = "geo!" + String(endCoord.Latitude) + "," + String(endCoord.Longitude);
        }
    );

    

	//	ROUTE QUERYING

	const mode = 'fastest;car;traffic:enabled;'
	const now = new Date();
	const curr_hour = now.getHours();
	const curr_minute = now.getMinutes();
	const curr_time = curr_hour * MINS_PER_HOUR + curr_minute;

	const query_deferred = [];
	const query_data = [];

	const tot_minutes = MINS_PER_HOUR * HOURS_PER_DAY;
	for (let i = curr_time; i < tot_minutes; i+=QUERY_FREQ_IN_MIN) {
		let departure = addMinutes(now, i - curr_time).toISOString();

		const deferred = axios.get(`${HERE_ENDPOINT}`, {
			params: {
				app_id: secret.HERE_APP_ID,
				app_code: secret.HERE_APP_CODE,
				waypoint0: waypoint0,
				waypoint1: waypoint1,
				mode: mode,
				departure: departure
			}
		}).then(function(result) {
			const data = result['data']['response']['route'][0]['summary']['trafficTime'];
            const travel_time = data / 60;

            query_data.push({
                key: i,
                label: departure,
                y: travel_time
            });
		}).catch(error => {
		  console.log(error);
		});

		query_deferred.push(deferred)
	}

	axios.all(query_deferred).then(function() {
		query_data.sort(function(a, b) {
			return a['key'] - b['key'];
		});


		//	OPTIMAL DEPARTURE TIME CALCULATION
		const timeSplit = desiredDeparture.split(':');
		const hours = parseInt(timeSplit[0], 10);
		const minutes = parseInt(timeSplit[1], 10);
		const tolerance = parseInt(tolerance, 10);
	
		const minuteIndex = hours*60 + minutes;
		const validRoutes = query_data.filter(elt => elt[0] > minuteIndex - tolerance && elt[0] < minuteIndex + tolerance);

		validRoutes.forEach(elt => console.log(elt[1][0].summary.trafficTime))

		var shortestRoute = validRoutes.reduce(function (shortest, route) {
			return (route[1][0].summary.trafficTime || 0) < shortest[1][0].summary.trafficTime ? route: shortest;
		  }, [null,[{summary:{trafficTime:Infinity}}]]);

		// console.log(shortestRoute);
		

		const result = {query_data: query_data, shortestRoute: shortestRoute}

		res.send(result);


		

	});
}

app.get("/histogram", function(req, res) {
	const result = submitQuery(res);
})
app.listen(8000)

