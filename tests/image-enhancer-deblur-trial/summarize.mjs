// Numerically rejected paths are diagnostic evidence, never quality successes.
export function summarize(rows) {
  const admitted = path => path.stages.find(s => s.name === 'raw-deblur')?.numericalAdmission === 'accepted';
  const final = path => path.stages.at(-1).mae;
  const pairs = rows.filter(row => row.paths.length === 2 && row.paths.every(admitted));
  return {
    comparisons: rows.length,
    rejectedPaths: rows.flatMap(row => row.paths.filter(path => !admitted(path))
      .map(path => ({id: row.id, condition: row.condition, route: path.route}))),
    admittedPairs: pairs.length,
    cleanupBetter: pairs.filter(row => final(row.paths[1]) < final(row.paths[0])).length,
    cleanupWorse: pairs.filter(row => final(row.paths[1]) > final(row.paths[0])).length,
    cleanupTie: pairs.filter(row => final(row.paths[1]) === final(row.paths[0])).length,
  };
}
