const fs = require('fs');
async function test() {
    const origin = [72.9991, 19.1587]; // Airoli (Lon, Lat)
    const dest = [73.8797, 18.5529];   // Yerwada (Lon, Lat)
    
    console.log("Fetching route...");
    const url = `https://router.project-osrm.org/route/v1/driving/${origin[0]},${origin[1]};${dest[0]},${dest[1]}?overview=full&geometries=geojson`;
    const res = await fetch(url);
    const data = await res.json();
    const route = data.routes[0];
    
    console.log("Route fetched. Distance:", route.distance);
    
    // Check distance from route points to Khalapur (73.3255, 18.8222)
    const khalapur = [73.3255, 18.8222]; // Lon, Lat
    let minDist = 999999;
    route.geometry.coordinates.forEach(c => {
        // Simple euclidean distance
        const dx = c[0] - khalapur[0];
        const dy = c[1] - khalapur[1];
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (dist < minDist) minDist = dist;
    });
    
    console.log("Min distance to Khalapur (degrees):", minDist);
    // 1 degree ~ 111 km. So 0.01 deg is ~1km.
    console.log("Approx distance in km:", minDist * 111);
}
test();
