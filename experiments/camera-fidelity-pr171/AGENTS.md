# Camera-fidelity experiment boundaries

- Source of truth: user-provided Master Engineering Blueprint V1.0, Tasks 0–12.
- User authorized Tasks 1–12 in order on 2026-10-12. Advance only after the preceding acceptance gate is met; report missing inputs. Production promotion still requires separate explicit approval.
- Never edit baseline/ or manifest.json. They preserve PR #171 head a672855f9c4047dafe31cd0823cfeb7de2bb04f7.
- Future authorized engine changes belong only in candidate/. Never change repository-root assets, tools, main, the original PR branch, or production URLs.
- Run python experiments/camera-fidelity-pr171/verify-baseline.py before and after work. --task0 additionally requires the candidate to remain identical.
- Do not import Rocket 1, Rocket 2 or Hybrid code. Those inherited repository directories are not experiment inputs.
- The image-enhancer.js copies are read-only integration references used by the inherited dispatch test, not runnable standalone UIs. No HTML entry point exists here.
- Do not merge, deploy, open a promotion PR, or invoke deployment workflows without explicit user approval.
- Baseline protection uses immutable Git provenance, checksums and local read-only permissions. It is not a server-enforced access-control rule; reapply read-only permissions after checkout.
