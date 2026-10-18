# Outside libraries

BoxTally serves its own copies of these instead of loading them from a CDN, so a
change on someone else's server can never run code on a signed-in page.

| File | Package | Taken from |
| --- | --- | --- |
| supabase-2.116.0.js | @supabase/supabase-js 2.116.0 | `dist/umd/supabase.js` |
| three-0.160.0.module.min.js | three 0.160.0 | `build/three.module.min.js` |
| three-addons/ | three 0.160.0 | `examples/jsm/` (only the two files BoxTally uses) |
| tesseract-5.1.1.min.js | tesseract.js 5.1.1 | `dist/tesseract.min.js` (its reading engine still downloads from jsDelivr the first time you scan) |

To update one: `npm pack <package>@<version>`, unpack it, copy the file in with the
new version in its name, change the path in `index.html` (and `sw.js`), and bump
`VERSION` in `sw.js`.
