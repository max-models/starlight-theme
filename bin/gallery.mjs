#!/usr/bin/env node
// `starlight-gallery <execute|convert|clean> [options]`: runs tools/gallery.py of this package in
// the project's Python, which needs nbformat (shared helpers) and whatever the example scripts
// import (matplotlib, plotly, ...). Run it from the site directory (docs/), as npm scripts do.
import { runTool } from './run-tool.mjs';

runTool('gallery');
