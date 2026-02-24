const test = require("node:test");
const assert = require("node:assert/strict");

const dataGenerator = require("../../modules/dataGenerator");

test("getCPUObject returns expected base shape", () => {
  const row = dataGenerator.getCPUObject();

  assert.equal(typeof row, "object");
  assert.equal(typeof row.tags, "object");
  assert.equal(typeof row.ts, "number");
  assert.equal(typeof row.usage_user, "number");
  assert.equal(typeof row.usage_system, "number");
  assert.equal(typeof row.usage_idle, "number");
});

test("getCPUObject can add extra tags", () => {
  const row = dataGenerator.getCPUObject(3);

  assert.ok(Object.hasOwn(row.tags, "tag_0"));
  assert.ok(Object.hasOwn(row.tags, "tag_1"));
  assert.ok(Object.hasOwn(row.tags, "tag_2"));
});

test("getCPUObjectBulkArray returns expected number of value tuples", () => {
  const bulk = dataGenerator.getCPUObjectBulkArray(5, 2);

  assert.equal(bulk.length, 5);
  for (const rowValues of bulk) {
    assert.ok(Array.isArray(rowValues));
    assert.ok(rowValues.length >= 12);
  }
});
