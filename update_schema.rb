require 'csv'
require 'json'

begin
  puts "Reading all_active_india_toll_plazas.json..."
  json_data = JSON.parse(File.read('all_active_india_toll_plazas.json'))
  coordinates = {}
  json_data.each do |p|
    id = p['tollplaza_id'].to_s
    lat = p['latitude'] ? p['latitude'].to_f : 0.0
    lng = p['longitude'] ? p['longitude'].to_f : 0.0
    if lat != 0.0 && lng != 0.0
      coordinates[id] = { lat: lat, lng: lng }
    end
  end

  puts "Reading unified_tolls_schema.csv..."
  csv_content = CSV.read('unified_tolls_schema.csv', headers: true)
  
  updated_rows = []
  updated_count = 0
  
  csv_content.each do |row|
    id = row['Primary_Plaza_ID']
    if coordinates.key?(id)
      row['Latitude'] = coordinates[id][:lat]
      row['Longitude'] = coordinates[id][:lng]
      updated_count += 1
    else
      # Preserve or format existing coordinates
      row['Latitude'] = row['Latitude'] ? row['Latitude'].to_f : 0.0
      row['Longitude'] = row['Longitude'] ? row['Longitude'].to_f : 0.0
    end
    updated_rows << row
  end

  puts "Writing updated rows to unified_tolls_schema.csv..."
  # Open with quote_empty: false to match standard formatting
  CSV.open('unified_tolls_schema.csv', 'wb', write_headers: true, headers: csv_content.headers) do |csv|
    updated_rows.each { |r| csv << r }
  end
  puts "Updated #{updated_count} rows in unified_tolls_schema.csv successfully!"

  # Generate database.js content
  puts "Updating webapp/database.js..."
  updated_csv_string = File.read('unified_tolls_schema.csv')
  database_js_content = "const CSV_DATA = `#{updated_csv_string.strip}`;\n"
  File.write('webapp/database.js', database_js_content)
  puts "Updated webapp/database.js successfully!"

rescue => e
  puts "Error: #{e.message}"
  puts e.backtrace
end
