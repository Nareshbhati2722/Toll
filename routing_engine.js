const fs = require('fs');

/**
 * UNIFIED ROUTING ENGINE
 * This script demonstrates how a backend system uses the single 'unified_tolls_schema.csv'
 * to calculate trips that involve both Fixed Barriers and Closed-Loop Matrix Expressways.
 */

// 1. Load the Unified Database
const unifiedData = fs.readFileSync('unified_tolls_schema.csv', 'utf8').trim().split('\n');

const fixedTolls = {}; // Lookup for standard fixed barriers
const matrixTolls = {}; // Lookup for matrix edges (entry->exit)
const allPlazas = {}; // Lookup for plaza details by ID

// We still need business logic for Fixed Plazas that "Link" together
const LINKED_BARRIER_SYSTEMS = {
    "Mumbai-Pune Expressway": { plazas: ["3815", "3817"], cap: 320 }
};

for (let i = 1; i < unifiedData.length; i++) {
    const cols = unifiedData[i].split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(c => c.replace(/"/g, '').trim());
    if (cols.length < 11) continue;

    const type = cols[0];
    const id = cols[1];
    const name = cols[2];
    const highway = cols[4];
    const entryId = cols[7];
    const exitId = cols[8];
    const cost = parseFloat(cols[10]);

    if (!allPlazas[id]) {
        allPlazas[id] = { name: name, highway: highway, type: type };
    }

    if (type === "Fixed Barrier") {
        fixedTolls[id] = { cost: cost, highway: highway };
    } else if (type === "Closed Loop Matrix") {
        matrixTolls[`${entryId}->${exitId}`] = { cost: cost, highway: highway };
    }
}

function getHighwayType(toll) {
    const hw = (toll.highway || "").trim().toUpperCase();
    const name = (toll.name || "").trim().toUpperCase();
    
    // 1. Expressway check
    const isExpressway = 
        toll.type === "Closed Loop Matrix" ||
        hw.startsWith("NE") || 
        hw === "9" || // Delhi-Meerut Expressway is Highway 9 in database
        hw.includes("EXPRESSWAY") ||
        name.includes("EXPRESSWAY") ||
        name.includes("DME") ||
        name.includes("MPE") ||
        name.includes("SPEEDWAY") ||
        name.includes("AIRPORT TOLL") ||
        // Add known expressways from MPE linked plazas
        ["3815", "3817", "3814", "3816", "1226", "1227", "1228", "1229"].includes(toll.id);
        
    if (isExpressway) return "Expressway";
    
    // 2. State Highway check
    const isStateHighway = 
        hw.startsWith("SH") || 
        name.includes(" SH ") || 
        name.includes("STATE HIGHWAY") ||
        name.endsWith(" SH") ||
        name.includes("MDR") || // Major District Road
        hw === ""; // Bypasses/local roads with empty highway in DB
        
    if (isStateHighway) return "State Highway / Other";
    
    // 3. National Highway check (default for remaining numbers)
    return "National Highway";
}

// 2. The Routing Algorithm
function calculateTrip(plazasCrossed, isOldHighway = false) {
    let total = 0;
    let breakdown = [];
    let visitedLinked = {}; // Track linked barrier caps
    let billedItems = []; // Track details of billed items

    // Resolve details for each plaza from database
    let resolvedPlazas = plazasCrossed.map(id => {
        const details = allPlazas[id] || {};
        if (fixedTolls[id] !== undefined) {
            return { id: id, type: "Fixed Barrier", cost: fixedTolls[id].cost, highway: details.highway || fixedTolls[id].highway, name: details.name || "" };
        } else {
            // Find highway for closed loop matrix plaza by searching entry/exit edges
            let highway = details.highway || null;
            if (!highway) {
                for (let [key, edge] of Object.entries(matrixTolls)) {
                    let [entry, exit] = key.split("->");
                    if (entry === id || exit === id) {
                        highway = edge.highway;
                        break;
                    }
                }
            }
            return { id: id, type: "Closed Loop Matrix", highway: highway, name: details.name || "" };
        }
    });

    // Filter out Mumbai-Pune Expressway ramp/mainline depending on route
    if (isOldHighway) {
        resolvedPlazas = resolvedPlazas.filter(p => p.id !== "3815" && p.id !== "3817");
    } else {
        // Filter out Mumbai-Pune Expressway ramp plazas if mainline plazas are crossed (Expressway trip)
        const hasMpeMainline = resolvedPlazas.some(p => p.id === "3815" || p.id === "3817");
        if (hasMpeMainline) {
            const mpeRamps = ["3814", "3816", "1226", "1227", "1228", "1229"];
            resolvedPlazas = resolvedPlazas.filter(p => !mpeRamps.includes(p.id));
        }
    }

    // Filter out intermediate plazas inside any Closed Loop Matrix systems (grouped by highway)
    let initialMatrixPlazas = resolvedPlazas.filter(p => p.type === "Closed Loop Matrix");
    let plazasByHw = {};
    for (let p of initialMatrixPlazas) {
        if (p.highway) {
            if (!plazasByHw[p.highway]) {
                plazasByHw[p.highway] = [];
            }
            plazasByHw[p.highway].push(p);
        }
    }

    let toRemove = new Set();
    for (let [hw, list] of Object.entries(plazasByHw)) {
        if (list.length >= 2) {
            const entryP = list[0];
            const exitP = list[list.length - 1];
            const entryIdx = resolvedPlazas.findIndex(p => p.id === entryP.id);
            const exitIdx = resolvedPlazas.findIndex(p => p.id === exitP.id);
            
            // Mark all plazas (Fixed Barrier or other Matrix plazas) between entryIdx and exitIdx for removal
            for (let i = entryIdx + 1; i < exitIdx; i++) {
                toRemove.add(resolvedPlazas[i].id);
            }
        }
    }

    // Filter resolvedPlazas to exclude any intermediate plazas
    resolvedPlazas = resolvedPlazas.filter(p => !toRemove.has(p.id));
    // Process Fixed Barriers
    let fixedPlazas = resolvedPlazas.filter(p => p.type === "Fixed Barrier");
    for (let toll of fixedPlazas) {
        let id = toll.id;
        let isLinked = false;
        for (let [sysName, rules] of Object.entries(LINKED_BARRIER_SYSTEMS)) {
            if (rules.plazas.includes(id)) {
                isLinked = true;
                if (!visitedLinked[sysName]) {
                    visitedLinked[sysName] = toll.cost;
                    if (toll.cost > 0) {
                        total += toll.cost;
                        breakdown.push(`Fixed Barrier: Plaza ${id} (${toll.name}) (Start of ${sysName}) - ₹${toll.cost}`);
                        billedItems.push({ id, name: toll.name, cost: toll.cost, category: getHighwayType(toll) });
                    }
                } else {
                    let balance = Math.max(0, rules.cap - visitedLinked[sysName]);
                    visitedLinked[sysName] += balance;
                    if (balance > 0) {
                        total += balance;
                        breakdown.push(`Fixed Barrier: Plaza ${id} (${toll.name}) (Linked Balance) - ₹${balance}`);
                        billedItems.push({ id, name: toll.name, cost: balance, category: getHighwayType(toll) });
                    }
                }
            }
        }

        if (!isLinked && toll.cost > 0) {
            total += toll.cost;
            breakdown.push(`Fixed Barrier: Plaza ${id} (${toll.name}) - ₹${toll.cost}`);
            billedItems.push({ id, name: toll.name, cost: toll.cost, category: getHighwayType(toll) });
        }
    }

    // Process Closed Loop Matrix systems (grouped by highway)
    let matrixPlazas = resolvedPlazas.filter(p => p.type === "Closed Loop Matrix");
    let plazasByHighway = {};
    for (let p of matrixPlazas) {
        if (p.highway) {
            plazasByHighway[p.highway] = plazasByHighway[p.highway] || [];
            plazasByHighway[p.highway].push(p.id);
        }
    }

    for (let [hw, list] of Object.entries(plazasByHighway)) {
        if (list.length >= 2) {
            const entry = list[0];
            const exit = list[list.length - 1];
            let key = `${entry}->${exit}`;
            let edge = matrixTolls[key];
            if (!edge) {
                // Direction fallback
                let revKey = `${exit}->${entry}`;
                if (matrixTolls[revKey] !== undefined) {
                    edge = matrixTolls[revKey];
                    key = revKey;
                }
            }
            if (edge !== undefined) {
                let cost = edge.cost;
                total += cost;
                breakdown.push(`Matrix Trip: ${key} on Highway ${hw} - ₹${cost}`);
                const exitPlaza = resolvedPlazas.find(p => p.id === exit);
                billedItems.push({ id: exit, name: exitPlaza ? exitPlaza.name : `Exit ${exit}`, cost: cost, category: getHighwayType(exitPlaza || { type: "Closed Loop Matrix", highway: hw, id: exit }) });
            } else {
                breakdown.push(`Matrix Error: Route ${key} on Highway ${hw} not found in database!`);
            }
        } else if (list.length === 1) {
            breakdown.push(`Matrix Entry: Plaza ${list[0]} (No charge yet)`);
        }
    }

    let categoryBreakdown = {
        "Expressway": 0,
        "National Highway": 0,
        "State Highway / Other": 0
    };
    for (let item of billedItems) {
        categoryBreakdown[item.category] += item.cost;
    }
    
    return { total, breakdown, categoryBreakdown };
}

// 3. Test the Engine!
function runTest(testName, plazas, isOldHighway = false) {
    console.log(`=== ${testName} ===`);
    const res = calculateTrip(plazas, isOldHighway);
    res.breakdown.forEach(b => console.log(b));
    console.log("Highway Category Breakdown:");
    Object.entries(res.categoryBreakdown).forEach(([cat, val]) => {
        if (val > 0) console.log(`  ${cat}: ₹${val}`);
    });
    console.log(`Total: ₹${res.total}\n`);
}

runTest("TEST 1: Airoli to Yerwada (Fixed Linked System)", ["3815", "3817"]);
runTest("TEST 2: Akshardham to Meerut (Matrix System)", ["1123", "1207"]);
runTest("TEST 3: Airoli to Lonavala (Hybrid Trip)", ["3815", "1228"]);
runTest("TEST 4: Airoli to Yerwada (Old Highway Route)", ["3814", "3815", "3816", "3817", "1227", "1228", "1229"], true);
runTest("TEST 5: Delhi to Mumbai (Closed Loop and Parallel Plazas)", ["1125", "635", "750", "962", "905", "3012", "721", "920", "732", "1014", "998", "93", "21", "115", "248", "162", "111", "113", "3860", "159", "107", "3870"]);
