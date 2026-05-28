const fs = require('fs');
const path = require('path');
const Papa = require('papaparse');
const turf = require('@turf/turf');

// Load DB
const DB_PATH = path.join(__dirname, 'database.js');
const dbContent = fs.readFileSync(DB_PATH, 'utf-8');
const startIdx = dbContent.indexOf('`') + 1;
const endIdx = dbContent.lastIndexOf('`');
const csvString = dbContent.substring(startIdx, endIdx);

const unifiedDatabase = Papa.parse(csvString, {
    header: true,
    skipEmptyLines: true
}).data.map(row => ({
    type: row.Toll_Logic_Type,
    id: row.Primary_Plaza_ID,
    name: row.Primary_Plaza_Name,
    lat: parseFloat(row.Latitude),
    lng: parseFloat(row.Longitude),
    cost: parseFloat(row.Car_Toll_INR)
}));

const patches = {
    "3815": { lat: 18.81925, lng: 73.301767 },
    "3817": { lat: 18.737814, lng: 73.636582 },
    "1123": { lat: 28.6139, lng: 77.2090 },
    "1207": { lat: 28.9845, lng: 77.7064 },
    "242": { lat: 19.5190, lng: 72.9169 },
    "241": { lat: 19.8905, lng: 72.9426 },
    "240": { lat: 20.4350, lng: 72.9172 },
    "239": { lat: 20.8855, lng: 73.0521 },
    "39": { lat: 21.3034, lng: 72.9542 }
};

unifiedDatabase.forEach(toll => {
    if (patches[toll.id]) {
        toll.lat = patches[toll.id].lat;
        toll.lng = patches[toll.id].lng;
    }
});

async function run() {
    const orig = [77.5946, 12.9716]; // Bangalore
    const dest = [72.8311, 21.1702]; // Surat
    console.log("Fetching route...");
    
    // Polyfill fetch for node
    const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
    
    const url = `https://router.project-osrm.org/route/v1/driving/${orig[0]},${orig[1]};${dest[0]},${dest[1]}?overview=full&geometries=geojson`;
    const res = await fetch(url);
    const data = await res.json();
    const route = data.routes[0];
    
    const line = turf.lineString(route.geometry.coordinates);
    const bufferedRoute = turf.buffer(line, 3, { units: 'kilometers' });

    let intersected = [];
    unifiedDatabase.forEach(toll => {
        if (toll.lat && toll.lng && toll.lat !== 0) {
            const pt = turf.point([toll.lng, toll.lat]);
            if (turf.booleanPointInPolygon(pt, bufferedRoute)) {
                intersected.push(toll);
            }
        }
    });
    
    console.log("Intersected tolls:", intersected.length);
    intersected.forEach(t => console.log(t.name, t.cost));
}

run().catch(console.error);
