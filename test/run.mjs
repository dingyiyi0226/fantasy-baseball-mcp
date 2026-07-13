/** Run all offline contract and regression checks in a stable, fail-fast order. */
const contracts = [
  "response-fixtures.mjs",
  "roster-tools.mjs",
  "player-tools.mjs",
  "config.mjs",
  "skill-workflows.mjs",
];

for (const contract of contracts) {
  await import(`./contracts/${contract}`);
}
