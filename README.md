# Ridemitr Spatial Toll Engine 🚗💨

**Ridemitr** is an end-to-end spatial toll calculation engine designed for Indian highways. It handles route-to-toll mapping using spatial analysis and applies complex toll rules (Fixed Barriers, Linked Capping Systems, and Closed-Loop Matrix Expressways) to estimate highly accurate pre-ride toll invoices.

The project features a **standalone Node.js calculation engine** and an interactive, premium **Dark Mode Glassmorphic web application** built with Leaflet.js maps, Turf.js spatial operators, and OpenStreetMap (OSRM) driving route models.

---

## 🌟 Key Features

*   **Turf.js Spatial Corridor Intersection**: Generates a 3km corridor buffer along route polylines to accurately capture toll plazas despite GPS drift or path simplification.
*   **Alternative Route Generator**: Calculates and visualizes multiple route options (e.g., Expressways vs. National Highways/Old Highways) and computes toll estimates for each.
*   **Complex Toll Logic Engines**:
    *   *Fixed Barriers*: Standard fixed cost barriers.
    *   *Linked Cap Systems*: Groups plazas (like the Mumbai-Pune Expressway mainline barriers) and applies total invoice caps (e.g., maximum ₹320).
    *   *Closed-Loop Matrix*: Computes tolls by grouping matrix entries and exits by highway (e.g., Delhi-Meerut Expressway), identifying entry/exit pairs, and filtering intermediate checkpoints.
*   **Premium Interactive Map UI**: Built using Leaflet maps, Carto Dark Matter basemaps, autocomplete suggestions via Nominatim, and dynamic invoice breakdowns.
*   **Validation Links**: Direct deep-links to verify estimates against TollGuru and Google Maps.

---

## 📁 Repository Structure

```tree
tollguru/
├── ARCHITECTURE.md                  # Deep technical analysis of algorithms & database
├── README.md                        # User guide & startup manual
├── package.json                     # Root npm scripts & packages
├── routing_engine.js                # CLI routing engine & demonstration
├── debug_route.js                   # Spatial coordinates debugging script
├── unified_tolls_schema.csv         # Consolidated tolls database
├── all_active_india_toll_plazas.json# Raw plaza geolocations dataset
├── update_unified_schema.js         # Coordinate compilation script (Node.js)
├── update_schema.rb                 # Coordinate compilation script (Ruby)
├── setup.js                         # Cross-platform setup compiler (Node.js)
├── setup.sh                         # macOS/Linux execution wrapper
├── setup.bat                        # Windows execution wrapper
└── ridemitr-webapp/                 # Frontend client app
    ├── index.html                   # Glassmorphic user interface
    ├── style.css                    # Vanilla CSS styles & layout
    ├── app.js                       # Client-side map & calculation logic
    ├── database.js                  # Injected CSV database
    ├── test.js                      # CLI route geocoding verification
    └── package.json                 # Webapp npm packages
```

---

## ⚡ Quickstart Setup

You can fully configure and run the project with a **single setup command**. 

### Prerequisite
Make sure you have [Node.js (v16+)](https://nodejs.org/) installed on your machine.

### Run Setup Script
Open your terminal in the project root directory and run:

#### macOS / Linux:
```bash
./setup.sh
```

#### Windows:
```cmd
setup.bat
```

*The setup wizard will install package dependencies for the root and webapp directories, run the database schema compilation, and verify all file assemblies.*

---

## 🚀 Running the Project

Once the setup is complete, you can launch the client web application or test the backend routing engine:

### 1. Run the Interactive Web Webapp (Browser)
Serve the Leaflet map and UI locally:
```bash
npm start
```
This launches a development web server at **[http://localhost:8080](http://localhost:8080)**. Open this link in your browser to plan routes, select alternatives, and view dynamic toll invoices.

### 2. Run the Node.js Test Verification
To test route fetching and toll intersections in the terminal:
```bash
npm test
```

### 3. Run the CLI Toll Engine Demonstration
To compute predefined test trips (e.g., Airoli to Lonavala, Delhi to Mumbai) through the pure calculation engine:
```bash
node routing_engine.js
```
