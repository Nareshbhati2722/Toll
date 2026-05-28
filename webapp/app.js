// --- LEAFLET MAP SETUP ---
let map;
let routeLayers = [];
let tollMarkers = [];

function initMap() {
    map = L.map('map').setView([20.5937, 78.9629], 5); // Center of India
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '© OpenStreetMap contributors, © CARTO',
        subdomains: 'abcd',
        maxZoom: 20
    }).addTo(map);
}

// --- MASTER DATABASE ---
let unifiedDatabase = [];

// Load CSV using PapaParse (using injected CSV_DATA)
function loadDatabase() {
    return new Promise((resolve) => {
        Papa.parse(CSV_DATA, {
            header: true,
            skipEmptyLines: true,
            complete: function(results) {
                unifiedDatabase = results.data.map(row => ({
                    type: row.Toll_Logic_Type,
                    id: row.Primary_Plaza_ID,
                    name: row.Primary_Plaza_Name,
                    state: row.State,
                    highway: row.Highway,
                    lat: parseFloat(row.Latitude),
                    lng: parseFloat(row.Longitude),
                    matrixEntryId: row.Matrix_Entry_ID,
                    matrixExitId: row.Matrix_Exit_ID,
                    cost: parseFloat(row.Car_Toll_INR)
                }));

                console.log("Database loaded:", unifiedDatabase.length, "tolls");
                resolve();
            }
        });
    });
}

// Linked System Rules
const LINKED_SYSTEMS = {
    "Mumbai-Pune Expressway": { plazas: ["3815", "3817"], cap: 320 }
};

// --- ROUTING ENGINE ---
async function getCoordinates(city) {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(city)}`);
    const data = await res.json();
    if (data.length > 0) {
        return [parseFloat(data[0].lon), parseFloat(data[0].lat)]; // OSRM uses Lon,Lat
    }
    throw new Error(`Could not find coordinates for ${city}`);
}

async function getOSRMRoute(originCoord, destCoord) {
    // 1. Fetch the direct route
    const directUrl = `https://router.project-osrm.org/route/v1/driving/${originCoord[0]},${originCoord[1]};${destCoord[0]},${destCoord[1]}?overview=full&geometries=geojson`;
    const directRes = await fetch(directUrl);
    const directData = await directRes.json();
    if (!directData.routes || directData.routes.length === 0) {
        throw new Error("Could not calculate a driving route. Please try more specific locations.");
    }
    const routes = [directData.routes[0]];

    // Bounding box check for Mumbai-Pune corridor
    // Mumbai box: Lat 18.8 to 19.3, Lng 72.7 to 73.15
    // Pune box: Lat 18.4 to 18.7, Lng 73.7 to 74.0
    const isMumbai = (coord) => coord[1] >= 18.8 && coord[1] <= 19.3 && coord[0] >= 72.7 && coord[0] <= 73.15;
    const isPune = (coord) => coord[1] >= 18.4 && coord[1] <= 18.7 && coord[0] >= 73.7 && coord[0] <= 74.0;

    let isMumbaiPune = false;
    let isPuneMumbai = false;

    if (isMumbai(originCoord) && isPune(destCoord)) {
        isMumbaiPune = true;
    } else if (isPune(originCoord) && isMumbai(destCoord)) {
        isPuneMumbai = true;
    }

    // 2. Generate Alternative Route A & B (Midpoint offset left & right)
    try {
        const dx = destCoord[0] - originCoord[0];
        const dy = destCoord[1] - originCoord[1];
        const len = Math.sqrt(dx*dx + dy*dy);
        if (len > 0.01) {
            const mx = originCoord[0] + dx / 2;
            const my = originCoord[1] + dy / 2;
            
            // Offset scale is 15% of straight-line distance, capped between 0.015 and 0.06 degrees
            const offsetDist = Math.max(0.015, Math.min(0.06, len * 0.15));

            // Alternative A (Offset Left)
            const ax = mx - (dy / len) * offsetDist;
            const ay = my + (dx / len) * offsetDist;
            const altUrlA = `https://router.project-osrm.org/route/v1/driving/${originCoord[0]},${originCoord[1]};${ax.toFixed(5)},${ay.toFixed(5)};${destCoord[0]},${destCoord[1]}?overview=full&geometries=geojson`;
            const resA = await fetch(altUrlA);
            const dataA = await resA.json();
            if (dataA.routes && dataA.routes.length > 0) {
                routes.push(dataA.routes[0]);
            }

            // Alternative B (Offset Right / Old Highway)
            if (isMumbaiPune || isPuneMumbai) {
                const wps = isMumbaiPune ? [
                    [73.2139, 18.8894], // Chowk
                    [73.7196, 18.7118]  // Somatane
                ] : [
                    [73.7196, 18.7118], // Somatane
                    [73.2139, 18.8894]  // Chowk
                ];
                const altUrlB = `https://router.project-osrm.org/route/v1/driving/${originCoord[0]},${originCoord[1]};${wps[0][0]},${wps[0][1]};${wps[1][0]},${wps[1][1]};${destCoord[0]},${destCoord[1]}?overview=full&geometries=geojson`;
                const resB = await fetch(altUrlB);
                const dataB = await resB.json();
                if (dataB.routes && dataB.routes.length > 0) {
                    const rB = dataB.routes[0];
                    rB.isOldHighway = true;
                    routes.push(rB);
                }
            } else {
                const bx = mx + (dy / len) * offsetDist;
                const by = my - (dx / len) * offsetDist;
                const altUrlB = `https://router.project-osrm.org/route/v1/driving/${originCoord[0]},${originCoord[1]};${bx.toFixed(5)},${by.toFixed(5)};${destCoord[0]},${destCoord[1]}?overview=full&geometries=geojson`;
                const resB = await fetch(altUrlB);
                const dataB = await resB.json();
                if (dataB.routes && dataB.routes.length > 0) {
                    routes.push(dataB.routes[0]);
                }
            }
        }
    } catch (e) {
        console.error("Error generating alternative routes:", e);
    }

    return routes;
}

function intersectTolls(routeGeojson) {
    const line = turf.lineString(routeGeojson.geometry.coordinates);
    // Create a 3km buffer around the route to catch plazas (accounts for GPS drift and polyline simplification)
    const bufferedRoute = turf.buffer(line, 3, { units: 'kilometers' });

    let intersectedPlazas = [];

    unifiedDatabase.forEach(toll => {
        if (toll.lat && toll.lng && toll.lat !== 0) {
            const pt = turf.point([toll.lng, toll.lat]); // Turf uses Lon,Lat
            if (turf.booleanPointInPolygon(pt, bufferedRoute)) {
                intersectedPlazas.push(toll);
            }
        }
    });

    // Note: In a real app, we would project points onto the line to sort chronologically.
    // For this demo, we'll sort them by distance from the origin point.
    const originPoint = turf.point(routeGeojson.geometry.coordinates[0]);
    intersectedPlazas.sort((a, b) => {
        const distA = turf.distance(originPoint, turf.point([a.lng, a.lat]));
        const distB = turf.distance(originPoint, turf.point([b.lng, b.lat]));
        return distA - distB;
    });

    return intersectedPlazas;
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

function calculateTollInvoice(intersectedPlazas, route) {
    let total = 0;
    let invoice = [];
    let visitedLinked = {}; 

    // 1. Deduplicate by plaza ID to start
    let uniquePlazas = [];
    let seenIds = new Set();
    for (let toll of intersectedPlazas) {
        if (!seenIds.has(toll.id)) {
            seenIds.add(toll.id);
            uniquePlazas.push(toll);
        }
    }

    // Filter out Mumbai-Pune Expressway ramp/mainline depending on route
    if (route && route.isOldHighway) {
        // Old Highway trip does not cross mainline plazas 3815 and 3817
        uniquePlazas = uniquePlazas.filter(p => p.id !== "3815" && p.id !== "3817");
    } else {
        // Expressway trip: Filter out MPE ramp plazas if mainline plazas are crossed
        const hasMpeMainline = uniquePlazas.some(p => p.id === "3815" || p.id === "3817");
        if (hasMpeMainline) {
            const mpeRamps = ["3814", "3816", "1226", "1227", "1228", "1229"];
            uniquePlazas = uniquePlazas.filter(p => !mpeRamps.includes(p.id));
        }
    }

    // Filter out intermediate plazas inside any Closed Loop Matrix systems (grouped by highway)
    let initialMatrixPlazas = uniquePlazas.filter(p => p.type === "Closed Loop Matrix");
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
            const entryIdx = uniquePlazas.findIndex(p => p.id === entryP.id);
            const exitIdx = uniquePlazas.findIndex(p => p.id === exitP.id);
            
            // Mark all plazas (Fixed Barrier or other Matrix plazas) between entryIdx and exitIdx for removal
            for (let i = entryIdx + 1; i < exitIdx; i++) {
                toRemove.add(uniquePlazas[i].id);
            }
        }
    }

    // Filter uniquePlazas to exclude any intermediate plazas
    uniquePlazas = uniquePlazas.filter(p => !toRemove.has(p.id));

    // 2. Pre-calculate Closed Loop pairs for each Highway
    // Find all Closed Loop Matrix plazas
    let matrixPlazas = uniquePlazas.filter(p => p.type === "Closed Loop Matrix");
    
    // Group them by highway, preserving their relative route order
    let plazasByHighway = {};
    for (let p of matrixPlazas) {
        if (p.highway) {
            if (!plazasByHighway[p.highway]) {
                plazasByHighway[p.highway] = [];
            }
            plazasByHighway[p.highway].push(p);
        }
    }

    // Determine Entry and Exit for each highway with >= 2 plazas
    let matrixPairs = {}; // highway -> { entryId, exitId, edge }
    for (let [hw, list] of Object.entries(plazasByHighway)) {
        if (list.length >= 2) {
            const entry = list[0];
            const exit = list[list.length - 1];
            // Find edge entry -> exit in database (fallback to exit -> entry if not found)
            let edge = unifiedDatabase.find(r => r.type === "Closed Loop Matrix" && r.matrixEntryId === entry.id && r.matrixExitId === exit.id);
            if (!edge) {
                edge = unifiedDatabase.find(r => r.type === "Closed Loop Matrix" && r.matrixEntryId === exit.id && r.matrixExitId === entry.id);
            }
            matrixPairs[hw] = {
                entry: entry.id,
                exit: exit.id,
                edge: edge
            };
        }
    }

    // 3. Process plazas in chronological order
    for (let toll of uniquePlazas) {
        if (toll.type === "Fixed Barrier") {
            let isLinked = false;
            for (let [sysName, rules] of Object.entries(LINKED_SYSTEMS)) {
                if (rules.plazas.includes(toll.id)) {
                    isLinked = true;
                    if (!visitedLinked[sysName]) {
                        visitedLinked[sysName] = toll.cost;
                        if (toll.cost > 0) {
                            total += toll.cost;
                            invoice.push({ id: toll.id, name: toll.name, type: `Fixed Barrier (${sysName})`, cost: toll.cost });
                        }
                    } else {
                        let balance = Math.max(0, rules.cap - visitedLinked[sysName]);
                        visitedLinked[sysName] += balance;
                        if (balance > 0) {
                            total += balance;
                            invoice.push({ id: toll.id, name: toll.name, type: "Fixed Barrier (Linked System Cap Applied)", cost: balance });
                        }
                    }
                }
            }

            if (!isLinked && toll.cost > 0) {
                total += toll.cost;
                invoice.push({ id: toll.id, name: toll.name, type: "Fixed Barrier", cost: toll.cost });
            }
        }
        else if (toll.type === "Closed Loop Matrix") {
            const hw = toll.highway;
            const pair = matrixPairs[hw];

            if (pair) {
                // If it is entry, print Entry (Ticket Generated)
                if (toll.id === pair.entry) {
                    invoice.push({ id: toll.id, name: toll.name, type: "Matrix Entry (Ticket Generated)", cost: 0 });
                }
                // If it is exit, print Exit (Distance Computed)
                else if (toll.id === pair.exit) {
                    if (pair.edge) {
                        total += pair.edge.cost;
                        invoice.push({ id: toll.id, name: toll.name, type: "Matrix Exit (Distance Computed)", cost: pair.edge.cost });
                    } else {
                        invoice.push({ id: toll.id, name: toll.name, type: "Matrix Exit (Edge not found)", cost: 0 });
                    }
                }
                // If intermediate, we skip/ignore!
            } else {
                // Only 1 plaza of this highway intersected, treat as ticket entry
                invoice.push({ id: toll.id, name: toll.name, type: "Matrix Entry (Ticket Generated)", cost: 0 });
            }
        }
    }
    
    // Post-process to add category classification
    const processedInvoice = invoice.map(item => {
        const toll = uniquePlazas.find(p => p.id === item.id);
        const category = toll ? getHighwayType(toll) : "National Highway";
        const categoryClass = category === "Expressway" ? "badge-expressway" : (category === "National Highway" ? "badge-national" : "badge-state");
        return { ...item, category, categoryClass };
    });

    let breakdown = {
        "Expressway": 0,
        "National Highway": 0,
        "State Highway / Other": 0
    };
    for (let item of processedInvoice) {
        breakdown[item.category] += item.cost;
    }

    return { total, invoice: processedInvoice, breakdown, intersectedPlazas: uniquePlazas };
}

// --- UI INTERACTIONS ---
document.addEventListener('DOMContentLoaded', async () => {

    initMap();
    await loadDatabase();

    const calcBtn = document.getElementById('calculateBtn');
    const originInput = document.getElementById('originInput');
    const destInput = document.getElementById('destInput');
    const btnSpan = calcBtn.querySelector('span');
    const btnLoader = document.getElementById('btnLoader');
    const invoicePanel = document.getElementById('invoicePanel');
    const invoiceItems = document.getElementById('invoiceItems');
    const totalCost = document.getElementById('totalCost');

    let originCacheCoord = null;
    let destCacheCoord = null;

    function setupAutocomplete(inputId, listId, isOrigin) {
        const input = document.getElementById(inputId);
        const list = document.getElementById(listId);
        let timeout = null;

        input.addEventListener('input', () => {
            clearTimeout(timeout);
            
            // Invalidate cache if user types manually
            if (isOrigin) originCacheCoord = null;
            else destCacheCoord = null;

            const query = input.value.trim();
            if (query.length < 3) {
                list.classList.add('hidden');
                return;
            }

            timeout = setTimeout(async () => {
                try {
                    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=in`);
                    const data = await res.json();
                    
                    list.innerHTML = '';
                    if (data.length > 0) {
                        data.forEach(place => {
                            const div = document.createElement('div');
                            div.className = 'autocomplete-item';
                            div.innerText = place.display_name;
                            div.addEventListener('click', () => {
                                // Populate the entire location name
                                input.value = place.display_name;
                                if (isOrigin) originCacheCoord = [parseFloat(place.lon), parseFloat(place.lat)];
                                else destCacheCoord = [parseFloat(place.lon), parseFloat(place.lat)];
                                list.classList.add('hidden');
                            });
                            list.appendChild(div);
                        });
                        list.classList.remove('hidden');
                    } else {
                        list.classList.add('hidden');
                    }
                } catch (e) {
                    console.error("Autocomplete error:", e);
                }
            }, 400);
        });

        document.addEventListener('click', (e) => {
            if (e.target !== input && e.target !== list) {
                list.classList.add('hidden');
            }
        });
    }

    setupAutocomplete('originInput', 'originSuggestions', true);
    setupAutocomplete('destInput', 'destSuggestions', false);

    let currentRoutes = [];
    let selectedRouteIndex = 0;

    function formatDuration(seconds) {
        const hrs = Math.floor(seconds / 3600);
        const mins = Math.round((seconds % 3600) / 60);
        if (hrs > 0) {
            return `${hrs} hr ${mins} min`;
        }
        return `${mins} min`;
    }

    function formatDistance(meters) {
        return `${(meters / 1000).toFixed(1)} km`;
    }

    function selectRoute(index) {
        selectedRouteIndex = index;
        const route = currentRoutes[index];
        
        // 1. Update UI cards active state
        const cards = document.querySelectorAll('.route-card');
        cards.forEach((card, idx) => {
            if (idx === index) {
                card.classList.add('active');
            } else {
                card.classList.remove('active');
            }
        });

        // 2. Update Map route styles
        routeLayers.forEach((layer, idx) => {
            if (idx === index) {
                layer.setStyle({
                    color: '#3b82f6', // Active blue color
                    weight: 6,
                    opacity: 0.95
                });
                layer.bringToFront();
            } else {
                layer.setStyle({
                    color: '#64748b', // Inactive slate gray color
                    weight: 4,
                    opacity: 0.4
                });
            }
        });

        // 3. Clear and draw toll markers for selected route
        tollMarkers.forEach(m => map.removeLayer(m));
        tollMarkers = [];

        const intersected = intersectTolls(route);
        const result = calculateTollInvoice(intersected, route);
        
        // Render invoice for selected route
        renderInvoice(result);

        // Draw toll markers for selected route
        result.intersectedPlazas.forEach(p => {
            const marker = L.circleMarker([p.lat, p.lng], {
                radius: 6,
                fillColor: "#f59e0b",
                color: "#fff",
                weight: 2,
                opacity: 1,
                fillOpacity: 1
            }).bindPopup(p.name).addTo(map);
            tollMarkers.push(marker);
        });

        // Animate map view to selected route
        map.fitBounds(routeLayers[index].getBounds(), { padding: [30, 30] });
    }

    function renderRouteSelector(routes) {
        const routeSelector = document.getElementById('routeSelector');
        routeSelector.innerHTML = '';
        
        if (routes.length <= 1) {
            routeSelector.classList.add('hidden');
            return;
        }

        const title = document.createElement('div');
        title.className = 'route-selector-title';
        title.innerText = 'Suggested Routes';
        routeSelector.appendChild(title);

        const list = document.createElement('div');
        list.className = 'route-options-list';
        
        routes.forEach((route, idx) => {
            // Pre-calculate toll cost for this alternative route
            const intersected = intersectTolls(route);
            const tollResult = calculateTollInvoice(intersected, route);
            const isBest = idx === 0;

            const card = document.createElement('div');
            card.className = `route-card ${idx === 0 ? 'active' : ''}`;
            
            // Format duration & distance
            const durationStr = formatDuration(route.duration);
            const distanceStr = formatDistance(route.distance);
            const costStr = tollResult.total > 0 ? `₹${tollResult.total}` : 'Toll-Free';

            const titleText = route.isOldHighway ? 'Old Mumbai-Pune Highway' : `Route ${idx + 1}`;
            const tagText = isBest ? 'Recommended' : (route.isOldHighway ? 'NH 48' : 'Alternative');
            const tagClass = isBest ? 'best' : (route.isOldHighway ? 'old-hw' : 'alt');

            card.innerHTML = `
                <div class="route-info-left">
                    <div class="route-name-row">
                        <span class="route-title">${titleText}</span>
                        <span class="route-tag ${tagClass}">${tagText}</span>
                    </div>
                    <span class="route-meta">${distanceStr} • ${durationStr}</span>
                </div>
                <div class="route-info-right">
                    <span class="route-toll-cost ${tollResult.total === 0 ? 'free' : ''}">${costStr}</span>
                    <span style="font-size: 11px; color: var(--text-muted);">Est. Toll</span>
                </div>
            `;

            card.addEventListener('click', () => selectRoute(idx));
            list.appendChild(card);
        });

        routeSelector.appendChild(list);
        routeSelector.classList.remove('hidden');
    }

    calcBtn.addEventListener('click', async () => {
        const origin = originInput.value.trim();
        const dest = destInput.value.trim();
        if (!origin || !dest) {
            alert("Please enter Origin and Destination cities!");
            return;
        }

        // UI Animation: Loading State
        btnSpan.classList.add('hidden');
        btnLoader.classList.remove('hidden');
        invoicePanel.classList.add('hidden');
        invoicePanel.classList.remove('visible');

        try {
            // 1. Geocode (Use cached if clicked from autocomplete, else fetch)
            const originCoord = originCacheCoord || await getCoordinates(origin);
            const destCoord = destCacheCoord || await getCoordinates(dest);

            // 2. OSRM Route
            const routes = await getOSRMRoute(originCoord, destCoord);
            
            // Clear previous route layers
            routeLayers.forEach(layer => map.removeLayer(layer));
            routeLayers = [];

            // Draw all route layers on map
            routes.forEach((route, idx) => {
                const latLngs = route.geometry.coordinates.map(c => [c[1], c[0]]); // Leaflet uses Lat,Lon
                
                const color = idx === 0 ? '#3b82f6' : '#64748b';
                const opacity = idx === 0 ? 0.95 : 0.4;
                const weight = idx === 0 ? 6 : 4;

                const polyline = L.polyline(latLngs, {
                    color: color,
                    weight: weight,
                    opacity: opacity
                }).addTo(map);

                polyline.on('click', () => {
                    selectRoute(idx);
                });

                routeLayers.push(polyline);
            });

            currentRoutes = routes;
            renderRouteSelector(routes);
            selectRoute(0);

        } catch (error) {
            alert(error.message);
        } finally {
            // Restore UI
            btnSpan.classList.remove('hidden');
            btnLoader.classList.add('hidden');
            invoicePanel.classList.remove('hidden');
            setTimeout(() => {
                invoicePanel.classList.add('visible');
            }, 50);
        }
    });

    function renderInvoice(result) {
        invoiceItems.innerHTML = '';
        if (result.invoice.length === 0) {
            invoiceItems.innerHTML = '<div style="text-align:center; color:gray;">No tolls detected on this route.</div>';
        }
        
        result.invoice.forEach(item => {
            const el = document.createElement('div');
            el.className = 'invoice-item';
            el.innerHTML = `
                <div class="item-details">
                    <span class="item-name"><span style="color:var(--primary-color);">[#${item.id}]</span> ${item.name}</span>
                    <span class="item-type">${item.type} <span class="item-category-badge ${item.categoryClass}">${item.category}</span></span>
                </div>
                <div class="item-cost">₹${item.cost}</div>
            `;
            invoiceItems.appendChild(el);
        });

        // Render breakdown summary
        const breakdownDiv = document.getElementById('invoiceBreakdown');
        breakdownDiv.innerHTML = '';
        
        const categories = [
            { name: "Expressway", dotClass: "dot-expressway" },
            { name: "National Highway", dotClass: "dot-national" },
            { name: "State Highway / Other", dotClass: "dot-state" }
        ];
        
        categories.forEach(cat => {
            const cost = result.breakdown[cat.name] || 0;
            if (cost > 0) {
                const row = document.createElement('div');
                row.className = 'breakdown-row';
                row.innerHTML = `
                    <span class="breakdown-label">
                        <span class="breakdown-dot ${cat.dotClass}"></span>
                        <span>${cat.name}</span>
                    </span>
                    <span class="breakdown-cost">₹${cost}</span>
                `;
                breakdownDiv.appendChild(row);
            }
        });
        
        if (breakdownDiv.children.length === 0) {
            breakdownDiv.classList.add('hidden');
        } else {
            breakdownDiv.classList.remove('hidden');
        }

        // Update validation links
        const originVal = originInput.value.trim();
        const destVal = destInput.value.trim();
        const tollguruLink = document.getElementById('tollguruLink');
        const googleMapsLink = document.getElementById('googleMapsLink');
        
        tollguruLink.href = `https://tollguru.com/trip-calculator?source=${encodeURIComponent(originVal)}&destination=${encodeURIComponent(destVal)}`;
        googleMapsLink.href = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(originVal)}&destination=${encodeURIComponent(destVal)}`;

        totalCost.innerText = `₹${result.total}`;
    }
});
