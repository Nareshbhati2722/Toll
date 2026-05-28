#!/usr/bin/env bash

# Exit immediately if any command fails
set -e

# Terminal Colors
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo -e "${RED}Error: Node.js is not installed.${NC}"
    echo "Please install Node.js (v16+) to run the setup script."
    echo "Visit: https://nodejs.org/"
    exit 1
fi

# Run the cross-platform setup installer
node setup.js
