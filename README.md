# Planarity

A static browser puzzle inspired by Jason Davies' Planarity.

## Implementation

- SVG vector rendering with pointer-based vertex dragging and background pan.
- Zoom scales graph-space stroke width naturally.
- Puzzle graph generation uses a guaranteed planar construction and validates every generated graph with a Boyer-Myrvold-based planarity engine compiled to WebAssembly.
- Reset restores the exact scrambled starting position; New Puzzle creates a new graph while preserving the selected vertex count.
- Timer begins on the first vertex interaction and stops when there are no proper edge crossings.

## Third-party notices

The embedded planarity WebAssembly core is derived from the Edge Addition Planarity Suite (EAPS), via the build used by the MIT-licensed TopoLoom project.

- TopoLoom: https://github.com/khalidsaidi/topoloom
- Edge Addition Planarity Suite: https://github.com/graph-algorithms/edge-addition-planarity-suite

See the upstream projects for their respective license and attribution terms.
