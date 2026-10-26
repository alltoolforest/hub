# Local PDF unlock runtime

Unmodified `qpdf.js` and `qpdf.wasm` from `@neslinesli93/qpdf-wasm` 0.3.0.
Upstream: https://github.com/neslinesli93/qpdf-wasm
Registry archive: https://registry.npmjs.org/@neslinesli93/qpdf-wasm/-/qpdf-wasm-0.3.0.tgz
Archive SHA-512 integrity: sha512-ObyTmabopTMwN6AGwrEkmDbdmM5wnwlRdn9jnJYQ2KbBUPdPDcfNf1QkcWFOVD+qIgSqILz9nK51e22T+x+gkQ==

The compiled runtime reports QPDF 12.2.0. Copyright (c) 2005–2021 Jay Berkenbilt; copyright (c) 2022–2025 Jay Berkenbilt and Manfred Holger. QPDF is licensed under Apache-2.0; see LICENSE-QPDF.txt. The package metadata declares ISC for the wrapper package. The published package includes no separate wrapper LICENSE file. Source/build instructions and dependency notices are available from the upstream repository and QPDF source: https://github.com/qpdf/qpdf/tree/v12.2.0 .

Runtime files are served locally, with no CDN or document upload. Each unlock uses a dedicated worker with a private virtual filesystem and a 60-second deadline. Passwords are supplied through a virtual password file and never stored in workspace snapshots. Worker termination releases runtime memory. Local recovery contains a decrypted document copy, as disclosed in the password dialog. Exported copies are unencrypted.
