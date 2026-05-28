const fs = require('fs');
const path = require('path');
const Papa = require('papaparse');

const DB_PATH = path.join(__dirname, 'database.js');
const PROGRESS_PATH = path.join(__dirname, 'progress.json');
const UPDATED_DB_PATH = path.join(__dirname, 'database_updated.js');

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function getCoordinates(query) {
    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`, {
            headers: {
                'User-Agent': 'Tollguru Ridemitr Script (nareshkumarbhati)'
            }
        });
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        const data = await res.json();
        if (data && data.length > 0) {
            return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
        }
        return null;
    } catch (e) {
        console.error(`Error fetching coordinates for ${query}:`, e.message);
        return null;
    }
}

async function main() {
    console.log("Reading database.js...");
    const dbContent = fs.readFileSync(DB_PATH, 'utf-8');
    
    // Extract CSV data between backticks
    const startIdx = dbContent.indexOf('`') + 1;
    const endIdx = dbContent.lastIndexOf('`');
    const csvString = dbContent.substring(startIdx, endIdx);
    
    const parsed = Papa.parse(csvString, {
        header: true,
        skipEmptyLines: true
    });
    
    let rows = parsed.data;
    console.log(`Total rows parsed: ${rows.length}`);
    
    let progress = {};
    if (fs.existsSync(PROGRESS_PATH)) {
        console.log("Loading progress...");
        progress = JSON.parse(fs.readFileSync(PROGRESS_PATH, 'utf-8'));
    }

    let processedCount = 0;
    
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        
        // Skip if already in progress or if coordinates are not 0
        if (progress[row.Primary_Plaza_ID]) {
            row.Latitude = progress[row.Primary_Plaza_ID].lat;
            row.Longitude = progress[row.Primary_Plaza_ID].lng;
            continue;
        }

        if (parseFloat(row.Latitude) !== 0 && parseFloat(row.Longitude) !== 0) {
            continue;
        }
        
        // Wait 1.5 seconds to respect Nominatim API rate limits
        await sleep(1500);
        
        const query = `${row.Primary_Plaza_Name}, ${row.State}, India`;
        console.log(`[${i+1}/${rows.length}] Fetching: ${query}`);
        
        const coords = await getCoordinates(query);
        if (coords) {
            row.Latitude = coords.lat.toFixed(5);
            row.Longitude = coords.lng.toFixed(5);
            progress[row.Primary_Plaza_ID] = { lat: row.Latitude, lng: row.Longitude };
            console.log(` -> Found: ${row.Latitude}, ${row.Longitude}`);
        } else {
            console.log(` -> Not found. Setting to 0,0 to prevent retries next time.`);
            progress[row.Primary_Plaza_ID] = { lat: 0, lng: 0 };
        }
        
        processedCount++;
        fs.writeFileSync(PROGRESS_PATH, JSON.stringify(progress, null, 2));
        console.log(`Saved progress. Processed ${processedCount} records in this run.`);
    }
    
    // Final save of progress
    fs.writeFileSync(PROGRESS_PATH, JSON.stringify(progress, null, 2));
    
    // Generate new CSV string
    const newCsvString = Papa.unparse(rows);
    const newDbContent = `const CSV_DATA = \`${newCsvString}\`;\n`;
    
    fs.writeFileSync(UPDATED_DB_PATH, newDbContent);
    console.log(`Done! Updated database saved to ${UPDATED_DB_PATH}`);
}

main().catch(console.error);
