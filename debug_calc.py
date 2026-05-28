import json
import csv
import math

def haversine(lon1, lat1, lon2, lat2):
    lon1, lat1, lon2, lat2 = map(math.radians, [lon1, lat1, lon2, lat2])
    dlon = lon2 - lon1
    dlat = lat2 - lat1
    a = math.sin(dlat/2)**2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon/2)**2
    c = 2 * math.asin(math.sqrt(a))
    r = 6371 # Radius of earth in kilometers
    return c * r

def point_to_segment_distance(px, py, ax, ay, bx, by):
    dx = bx - ax
    dy = by - ay
    if dx == 0 and dy == 0:
        return haversine(px, py, ax, ay)
    
    t = ((px - ax) * dx + (py - ay) * dy) / (dx*dx + dy*dy)
    t = max(0, min(1, t))
    
    nx = ax + t * dx
    ny = ay + t * dy
    
    return haversine(px, py, nx, ny)

def min_distance_to_route(point_coords, route_coords):
    min_dist = float('inf')
    for i in range(len(route_coords) - 1):
        seg_start = route_coords[i]
        seg_end = route_coords[i+1]
        dist = point_to_segment_distance(point_coords[0], point_coords[1], seg_start[0], seg_start[1], seg_end[0], seg_end[1])
        if dist < min_dist:
            min_dist = dist
    return min_dist

# Load CSV Database
database = []
patches = {
    "3815": { 'lat': 18.81925, 'lng': 73.301767 },
    "3817": { 'lat': 18.737814, 'lng': 73.636582 },
    "1123": { 'lat': 28.6139, 'lng': 77.2090 },
    "1207": { 'lat': 28.9845, 'lng': 77.7064 },
    "242": { 'lat': 19.5190, 'lng': 72.9169 },
    "241": { 'lat': 19.8905, 'lng': 72.9426 },
    "240": { 'lat': 20.4350, 'lng': 72.9172 },
    "239": { 'lat': 20.8855, 'lng': 73.0521 },
    "39": { 'lat': 21.3034, 'lng': 72.9542 }
}

with open('unified_tolls_schema.csv', 'r') as f:
    reader = csv.DictReader(f)
    for row in reader:
        try:
            pid = row['Primary_Plaza_ID']
            lat = float(row['Latitude']) if row['Latitude'] else 0.0
            lng = float(row['Longitude']) if row['Longitude'] else 0.0
            if pid in patches:
                lat = patches[pid]['lat']
                lng = patches[pid]['lng']
            
            database.append({
                'type': row['Toll_Logic_Type'],
                'id': pid,
                'name': row['Primary_Plaza_Name'],
                'state': row['State'],
                'highway': row['Highway'],
                'lat': lat,
                'lng': lng,
                'matrixEntryId': row['Matrix_Entry_ID'],
                'matrixExitId': row['Matrix_Exit_ID'],
                'cost': float(row['Car_Toll_INR']) if row['Car_Toll_INR'] else 0.0
            })
        except Exception as e:
            pass

# Load Route Coords
with open('/Users/nareshkumarbhati/.gemini/antigravity-ide/brain/cec12bd0-e728-4c27-8cc2-898288392ce9/route_nominatim.json', 'r') as f:
    route_data = json.load(f)
route_coords = route_data['routes'][0]['geometry']['coordinates']

# Intersect Plazas (3km buffer, then 0.5km precision check)
origin_point = route_coords[0]
intersected = []
for plaza in database:
    if plaza['lat'] != 0.0 and plaza['lng'] != 0.0:
        dist = min_distance_to_route([plaza['lng'], plaza['lat']], route_coords)
        if dist <= 3.0: # 3km buffer
            plaza['min_dist'] = dist
            plaza['dist_from_origin'] = haversine(origin_point[0], origin_point[1], plaza['lng'], plaza['lat'])
            intersected.append(plaza)

# Sort by distance from origin
intersected.sort(key=lambda x: x['dist_from_origin'])

print("\n--- Applying 500m Perpendicular Distance Filter ---")
filtered_precision = [p for p in intersected if p['min_dist'] <= 0.5]
for p in filtered_precision:
    print(f"ID: {p['id']}, Name: {p['name']}, Cost: ₹{p['cost']}, Dist: {p['min_dist']*1000:.1f}m")

# Simulate calculateTollInvoice
print("\n--- Simulating calculateTollInvoice (Expressway Mode) ---")
unique_plazas = []
seen = set()
for p in filtered_precision:
    if p['id'] not in seen:
        seen.add(p['id'])
        unique_plazas.append(p)

# Filter out MPE ramps if mainline is crossed
has_mpe_mainline = any(p['id'] in ["3815", "3817"] for p in unique_plazas)
if has_mpe_mainline:
    mpe_ramps = ["3814", "3816", "1226", "1227", "1228", "1229"]
    unique_plazas = [p for p in unique_plazas if p['id'] not in mpe_ramps]

# Invoice logic
LINKED_SYSTEMS = {
    "Mumbai-Pune Expressway": { 'plazas': ["3815", "3817"], 'cap': 320 }
}
visited_linked = {}
total = 0
invoice = []

for p in unique_plazas:
    if p['type'] == "Fixed Barrier":
        is_linked = False
        for sys_name, rules in LINKED_SYSTEMS.items():
            if p['id'] in rules['plazas']:
                is_linked = True
                if sys_name not in visited_linked:
                    visited_linked[sys_name] = p['cost']
                    if p['cost'] > 0:
                        total += p['cost']
                        invoice.append((p['id'], p['name'], f"Fixed Barrier ({sys_name})", p['cost']))
                else:
                    balance = max(0, rules['cap'] - visited_linked[sys_name])
                    visited_linked[sys_name] += balance
                    if balance > 0:
                        total += balance
                        invoice.append((p['id'], p['name'], "Fixed Barrier (Linked System Cap Applied)", balance))
        if not is_linked and p['cost'] > 0:
            total += p['cost']
            invoice.append((p['id'], p['name'], "Fixed Barrier", p['cost']))

print("Invoice Items:")
for item in invoice:
    print(f"  [#{item[0]}] {item[1]} ({item[2]}): ₹{item[3]}")
print(f"Total computed toll: ₹{total}")
