const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Colors for terminal output
const colors = {
    reset: "\x1b[0m",
    bright: "\x1b[1m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
    magenta: "\x1b[35m",
    cyan: "\x1b[36m",
    red: "\x1b[31m"
};

function log(message, color = colors.reset) {
    console.log(`${color}${message}${colors.reset}`);
}

function runCommand(command, cwd = process.cwd()) {
    try {
        log(`Running: ${command}`, colors.cyan);
        execSync(command, { cwd, stdio: 'inherit' });
        return true;
    } catch (error) {
        log(`Error executing: ${command}`, colors.red);
        log(error.message, colors.red);
        return false;
    }
}

log("\n=============================================", colors.magenta + colors.bright);
log("        RIDEMITR SPATIAL TOLL ENGINE        ", colors.blue + colors.bright);
log("            Unified Setup Wizard            ", colors.blue + colors.bright);
log("=============================================\n", colors.magenta + colors.bright);

// 1. Verify Node.js Environment
log(`System OS: ${process.platform} (${process.arch})`);
log(`Node Version: ${process.version}\n`);

// 2. Install Root Dependencies
log("--- Step 1: Installing root dependencies ---", colors.yellow + colors.bright);
if (!runCommand("npm install")) {
    log("Failed to install root dependencies. Exiting.", colors.red + colors.bright);
    process.exit(1);
}
log("✓ Root dependencies installed successfully!\n", colors.green);

// 3. Install Webapp Dependencies
log("--- Step 2: Installing webapp dependencies ---", colors.yellow + colors.bright);
const webappDir = path.join(__dirname, 'ridemitr-webapp');
if (!runCommand("npm install", webappDir)) {
    log("Failed to install webapp dependencies. Exiting.", colors.red + colors.bright);
    process.exit(1);
}
log("✓ Webapp dependencies installed successfully!\n", colors.green);

// 4. Update Unified Schema
log("--- Step 3: Compiling spatial database & coordinates ---", colors.yellow + colors.bright);
if (!runCommand("node update_unified_schema.js")) {
    log("Failed to update database schema. Exiting.", colors.red + colors.bright);
    process.exit(1);
}
log("✓ Spatial database coordinates compiled successfully!\n", colors.green);

// 5. Verify the compilation files
log("--- Step 4: Verifying setup files ---", colors.yellow + colors.bright);
const csvPath = path.join(__dirname, 'unified_tolls_schema.csv');
const dbJsPath = path.join(__dirname, 'ridemitr-webapp', 'database.js');

let verified = true;
if (!fs.existsSync(csvPath)) {
    log("✗ Warning: 'unified_tolls_schema.csv' is missing!", colors.red);
    verified = false;
} else {
    log("✓ 'unified_tolls_schema.csv' verified.", colors.green);
}

if (!fs.existsSync(dbJsPath)) {
    log("✗ Warning: 'ridemitr-webapp/database.js' is missing!", colors.red);
    verified = false;
} else {
    log("✓ 'ridemitr-webapp/database.js' verified.", colors.green);
}

if (verified) {
    log("\n=============================================", colors.green + colors.bright);
    log("       SETUP COMPLETED SUCCESSFULLY!         ", colors.green + colors.bright);
    log("=============================================\n", colors.green + colors.bright);
    log("You are ready to run the project. Here are your options:\n");
    log("1. Start the local client-side dev webapp server:", colors.bright);
    log("   npm start", colors.cyan);
    log("   (This serves the webapp at http://localhost:8080)\n");
    log("2. Run the command-line test script:", colors.bright);
    log("   npm test", colors.cyan);
    log("   (This runs a Node.js route-to-toll calculation test)\n");
    log("3. Run the standalone backend routing demonstration:", colors.bright);
    log("   node routing_engine.js", colors.cyan);
    log("\nHave a nice ride! 🚗💨\n", colors.magenta + colors.bright);
} else {
    log("✗ Verification failed. Please check previous error logs.", colors.red + colors.bright);
    process.exit(1);
}
