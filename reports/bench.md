| Metric | Result |
| --- | --- |
| Parse throughput (sample, 3.9k spans) | 208,797 spans/s (103.2 MB/s, median of 9 runs) |
| Parse + validate 100k spans | 491.1 ms (207,210 spans/s) |
| Aggregate 100k spans (traces + overview) | 95.9 ms |
| Filter 100k spans | 21.5 ms |
| Load to first table row, 100k spans (Chromium, median of 3) | 0.64 s |
| Bundle size, gzip (all assets) | 229.8 kB |
| Bundle size, gzip (initial load) | 123.1 kB |
| Unit tests (Vitest) | 43 passed, 0 failed |
| E2E tests (Playwright) | 11 passed, 0 failed |
| axe violations (WCAG 2.1 AA) | 0 across 8 view states |
