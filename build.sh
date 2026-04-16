#!/bin/bash
# Build Chrome extension for submission
zip -r markview-extension.zip . -x "*.md" "build.sh" "icons/.gitkeep"
