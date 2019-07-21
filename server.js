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
	const waypoint0 = 'geo!52.5,13.4';
	const waypoint1 = 'geo!52.5,13.45';
	const mode = 'fastest;car;traffic:enabled;'

	const now = new Date();
	const curr_hour = now.getHours();
	const curr_minute = now.getMinutes();
	const curr_time = curr_hour * MINS_PER_HOUR + curr_minute;

	const query_deferred = [];
	const query_data = [];

	const tot_minutes = MINS_PER_HOUR * HOURS_PER_DAY;
	for (let i = curr_time; i < tot_minutes; i+=QUERY_FREQ_IN_MIN) {
		departure = addMinutes(now, i - curr_time).toISOString();

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
			query_data.push([i, data]);
		}).catch(error => {
		  console.log(error);
		});

		query_deferred.push(deferred)
	}

	axios.all(query_deferred).then(function() {
		query_data.sort(function(a, b) {
			return a[0] - b[0]
		});
		res.send(query_data);
	});
}

app.get("/histogram", function(req, res) {
	const query_data = submitQuery(res);
})
app.listen(8000)

