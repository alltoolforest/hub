# AllToolForest v2 Architecture

This branch is the safe development area for restructuring AllToolForest without changing the live `main` branch.

## Product structure

AllToolForest will be organized into four primary categories:

- Work
- Documents
- Images
- Calculators

## Migration principles

1. Preserve the current six working tools before adding new ones.
2. Move away from a single large `index.html` toward shared assets and category/tool pages.
3. Keep browser-side processing wherever technically practical and only make privacy claims that match the implementation.
4. Build Documents first as the primary expansion area.
5. Do not introduce a framework or backend until a concrete feature requires one.

## Target directory structure

```text
/
├── index.html
├── assets/
│   ├── css/
│   │   └── main.css
│   └── js/
│       └── main.js
├── work/
│   └── index.html
├── documents/
│   └── index.html
├── images/
│   └── index.html
├── calculators/
│   └── index.html
├── about/
│   └── index.html
├── privacy/
│   └── index.html
└── docs/
    └── ARCHITECTURE.md
```

## First migration milestone

- Create the four-category homepage.
- Extract shared CSS and common JavaScript from the existing single-file app.
- Preserve all six current tools while moving them into appropriate sections.
- Add category landing pages.
- Add individual tool URLs progressively.

## Existing tool mapping

### Work
- Resume Editor
- Freelance Invoice Builder
- LinkedIn Carousel Builder

### Documents
- PDF Splitter

### Images
- Image Compressor / Passport Portal Resizer

### Calculators
- CTC & In-Hand Salary Estimator

## Documents roadmap

1. PDF Splitter — preserve existing tool
2. PDF Merger
3. PDF Compressor
4. JPG to PDF
5. PDF Editor v1
6. DOCX editor
7. XLSX editor
8. PPTX editor

## Important constraint

The current production page remains untouched on `main` until the v2 branch is reviewed and tested.