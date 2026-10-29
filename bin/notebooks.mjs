#!/usr/bin/env node
// `starlight-notebooks <execute|convert|list|clean> [options]`: runs tools/notebooks.py of this package
// in the project's Python, which needs nbclient, nbformat and ipykernel. Run it from the site
// directory (docs/), as npm scripts do.
import { runTool } from './run-tool.mjs';

runTool('notebooks');
