# Requirement Plugins & Extensions Guide 🔌

This document outlines the recommended developer environment extensions, core GIS web libraries/plugins used in the project, and instructions on how to extend the toll engine's capabilities.

---

## 🛠️ 1. Recommended Editor & IDE Extensions

To set up a highly productive development environment, we recommend installing the following extensions (configured for VS Code, but adaptable for WebStorm, Sublime, or Atom):

### Core Extensions
*   **Live Server (by Ritwick Dey)**: 
    *   *Why*: Client-side scripts fetch APIs and load local assets. Opening `index.html` directly via `file://` causes CORS policy issues. Live Server serves the app locally on a development port (`http://localhost:5500` or similar).
    *   *VS Code Identifier*: `ritwickdey.liveserver`
*   **ESLint (by Microsoft)**:
    *   *Why*: Ensures code style conformity and catches potential runtime errors in the JavaScript files.
    *   *VS Code Identifier*: `dbaeumer.vscode-eslint`
*   **Prettier - Code Formatter (by Prettier)**:
    *   *Why*: Automatically formats HTML, JS, and CSS files on save.
    *   *VS Code Identifier*: `esbenp.prettier-vscode`

### Language Tooling Extensions
*   **Ruby LSP (by Shopify)**:
    *   *Why*: Provides auto-complete, diagnostics, and linting for the `update_schema.rb` database builder script.
    *   *VS Code Identifier*: `shopify.ruby-lsp`
*   **GitLens (by GitKraken)**:
    *   *Why*: Helps track changes, history, and branch status of the repository directly in the code editor.
    *   *VS Code Identifier*: `eamodio.gitlens`

---

## 🗺️ 2. GIS & Mapping Web Plugins

The frontend mapping user interface leverages several powerful geospatial extensions and libraries loaded via CDN inside [webapp/index.html](file:///Users/nareshkumarbhati/Desktop/tollguru/webapp/index.html):

| Plugin/Library | Version | Purpose | Source |
| :--- | :--- | :--- | :--- |
| **Leaflet.js** | `1.9.4` | Mobile-friendly interactive maps. Renders tiles and handles markers/polylines. | [Leaflet](https://leafletjs.com/) |
| **Carto Dark Basemap** | N/A | Premium dark-themed vector tiles tailored for contrast with colored routes. | [CARTO](https://carto.com/) |
| **Turf.js** | `6.5.0` | Geospatial processing. Handles polyline buffering and point containment. | [Turf.js](https://turfjs.org/) |
| **PapaParse** | `5.4.1` | In-memory CSV parser. Converts the raw CSV strings into queryable objects. | [PapaParse](https://www.papaparse.com/) |
| **OSRM Route API** | `v1` | Open Source Routing Machine. Computes real-time driving paths between coordinates. | [OSRM](http://project-osrm.org/) |
| **Nominatim API** | N/A | OpenStreetMap search engine. Provides location-to-coordinate geocoding. | [Nominatim](https://nominatim.org/) |

---

## 🔌 3. How to Extend the Toll Engine

The codebase is built modularly, making it easy to create custom rule plugins or swap APIs.

### Plugin Scenario A: Adding a New Linked Barrier System
If a new expressway or highway implements a pricing cap across multiple plazas, you can add it to the `LINKED_SYSTEMS` registry:

1.  Open [webapp/app.js](file:///Users/nareshkumarbhati/Desktop/tollguru/webapp/app.js) and locate the rules configuration:
    ```javascript
    const LINKED_SYSTEMS = {
        "Mumbai-Pune Expressway": { plazas: ["3815", "3817"], cap: 320 },
        "New Expressway Corridor": { plazas: ["101", "102", "103"], cap: 150 } // Custom Addition
    };
    ```
2.  Open [routing_engine.js](file:///Users/nareshkumarbhati/Desktop/tollguru/routing_engine.js) and make the same addition to keep backend CLI outputs matched.

### Extension Scenario B: Swapping OSRM with Google Maps API
If you want to transition from OSRM to the Google Maps Directions API, edit the fetch block inside the `getOSRMRoute` function in [webapp/app.js](file:///Users/nareshkumarbhati/Desktop/tollguru/webapp/app.js#L60):

```javascript
// Swap this:
const directUrl = `https://router.project-osrm.org/route/v1/driving/${origin[0]},${origin[1]}...`;

// With your Google Maps Directions API:
const directUrl = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin[1]},${origin[0]}&destination=${dest[1]},${dest[0]}&key=YOUR_API_KEY`;
```
*(Ensure the coordinate order is adjusted, as OSRM uses `[Lon, Lat]` while Google Maps uses `[Lat, Lon]`)*.
