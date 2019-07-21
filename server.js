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

const HERE_GEO_ENDPOINT = 'https://geocoder.api.here.com/6.2/geocode.json';
const HERE_TIME_ENDPOINT = 'https://route.api.here.com/routing/7.2/calculateroute.json';

const _createGeo = function(result) {
	const startCoord = result.data.Response.View[0].Result[0].Location.NavigationPosition[0];
    return `geo!${startCoord.Latitude},${startCoord.Longitude}`;
}

const _submitGeocode = function(res) {
	//HARD CODED INPUTS
	const startDest = "540 Page Street, San Francisco CA"
	const endDest = "44 Tehama Street, San Francisco CA"

	const geocode_data = {};
	const geocode_positions = [
		['startWayPoint', startDest],
		['endWayPoint', endDest]
	];
	const deferred_geos = []
	geocode_positions.forEach((element) => {
		const geoKey = element[0];
		const position = element[1];
		const curr_deferred = axios.get(HERE_GEO_ENDPOINT, {
	    	params: {
	    		app_id: secret.HERE_APP_ID,
	    		app_code: secret.HERE_APP_CODE,
	    		searchtext: position		
	    	}
	    }).then(function(result) {
	        return [geoKey, _createGeo(result)];
	    });
	    deferred_geos.push(curr_deferred);
	})
	return deferred_geos;
}

const addMinutes = function(date, minutes) {
	return new Date(date.getTime() + minutes * 60000);
}

const submitQuery = function(res, waypoint0, waypoint1) {
 	//	ROUTE QUERYING
	const mode = 'fastest;car;traffic:enabled;'
	const now = new Date();
	const curr_hour = now.getHours();
	const curr_minute = now.getMinutes();
	const curr_time = curr_hour * MINS_PER_HOUR + curr_minute;

	const query_deferred = [];
	const query_data = [];

	const tot_minutes = MINS_PER_HOUR * HOURS_PER_DAY;
	for (let i = curr_time; i < tot_minutes; i += QUERY_FREQ_IN_MIN) {
		let departure = addMinutes(now, i - curr_time).toISOString();

		const deferred = axios.get(HERE_TIME_ENDPOINT, {
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
		const desiredDeparture = "20:22";

		const timeSplit = desiredDeparture.split(':');
		const hours = parseInt(timeSplit[0], 10);
		const minutes = parseInt(timeSplit[1], 10);
		const tolerance = parseInt("130", 10);
	
		const minuteIndex = hours*60 + minutes;
		const validRoutes = query_data.filter(elt => elt[0] > minuteIndex - tolerance && elt[0] < minuteIndex + tolerance);
		console.log(validRoutes);

		validRoutes.forEach(elt => console.log(elt[1][0].summary.trafficTime))

		var shortestRoute = validRoutes.reduce(function (shortest, route) {
			return (route[1][0].summary.trafficTime || 0) < shortest[1][0].summary.trafficTime ? route: shortest;
		  }, [null,[{summary:{trafficTime:Infinity}}]]);

		console.log(shortestRoute);
		
		const result = {query_data: query_data, shortestRoute: shortestRoute}
		res.send(result);
	});
}

app.get("/histogram", function(req, res) {
	const deferred_geos = _submitGeocode(res);
	axios.all(deferred_geos).then(function(results) {
		let waypoint0 = '';
		let waypoint1 = '';
		results.forEach(result => {
			if (result[0] == 'startWayPoint') {
				waypoint0 = result[1];
			} else {
				waypoint1 = result[1];
			}
		});
		submitQuery(res, waypoint0, waypoint1);
	});
});

app.listen(8000)

