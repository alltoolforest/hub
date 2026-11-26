# PDF.js for Scanned PDF to Text

The PDF.js 6.3.289 legacy browser and worker builds come from the version already vendored at `hybrid-build/node_modules/pdfjs-dist`. The legacy builds provide compatibility for browser engines without newer typed-array and Promise APIs. The license is kept in this directory.

The main bundle has one local change to PDFPageProxy's operator-list stream error handler. It rejects the operator-list promise before marking the last chunk or notifying render tasks. Without that ordering, a rejected image-size check can resolve the classification promise with an incomplete operator list. Scanned PDF to Text could then report an oversized scan as blank or miss images on a mixed page. The browser test uses a 36-megapixel JPEG embedded between two native-text pages to cover this case. The worker is unmodified.

| File | SHA-256 |
| --- | --- |
| Patched `pdf.min.mjs` | `b1e0ebbdb2317652ec02fc9c06d2d72efe0d7095df73c980a05bcbc7fe17291e` |
| Upstream `pdf.worker.min.mjs` | `a33cfe728c584fdba4fcc1fd54bcdc2f9f2f13889ddbb5b2bd1d0f8cbe49b84e` |
