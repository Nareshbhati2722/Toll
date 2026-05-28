const fs = require('fs');

try {
    // Read raw JSON for coordinates
    const rawData = JSON.parse(fs.readFileSync('all_active_india_toll_plazas.json', 'utf8'));
    const coordinates = {};
    rawData.forEach(p => {
        // Fix key name to match JSON schema (tollplaza_id, latitude, longitude)
        coordinates[p.tollplaza_id] = { lat: parseFloat(p.latitude || 0), lng: parseFloat(p.longitude || 0) };
    });

    // Read current unified schema
    const unifiedData = fs.readFileSync('unified_tolls_schema.csv', 'utf8').trim().split('\n');
    
    // Header
    let updatedCsv = 'Toll_Logic_Type,Primary_Plaza_ID,Primary_Plaza_Name,State,Highway,Latitude,Longitude,Matrix_Entry_ID,Matrix_Exit_ID,Distance_Km,Car_Toll_INR\n';

    for (let i = 1; i < unifiedData.length; i++) {
        const cols = unifiedData[i].split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(c => c.replace(/"/g, '').trim());
        if (cols.length < 11) continue;
        
        const type = cols[0];
        const id = cols[1];
        const name = cols[2];
        const state = cols[3];
        const hw = cols[4];
        const entryId = cols[7];
        const exitId = cols[8];
        const dist = cols[9];
        const cost = cols[10];

        const lat = coordinates[id] ? coordinates[id].lat : 0;
        const lng = coordinates[id] ? coordinates[id].lng : 0;

        updatedCsv += `"${type}","${id}","${name}","${state}","${hw}",${lat},${lng},"${entryId}","${exitId}",${dist},${cost}\n`;
    }

    fs.writeFileSync('unified_tolls_schema.csv', updatedCsv);
    console.log("Unified schema updated with Latitude and Longitude successfully!");

} catch (e) {
    console.error(e);
}
