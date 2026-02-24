const test = require("node:test");
const assert = require("node:assert/strict");

const sqlGenerator = require("../../modules/sqlGenerator");

test("builds drop table statement", () => {
  const sql = sqlGenerator.getDropTable("doc.cpu");
  assert.equal(sql, "DROP TABLE IF EXISTS doc.cpu;");
});

test("builds create table statement with shards and replicas", () => {
  const sql = sqlGenerator.getCreateTable("doc.cpu", 6, "0-1");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS doc\.cpu/);
  assert.match(sql, /CLUSTERED INTO 6 SHARDS/);
  assert.match(sql, /number_of_replicas = '0-1'/);
});

test("builds insert and refresh statements", () => {
  const insertSql = sqlGenerator.getInsert("doc.cpu");
  const refreshSql = sqlGenerator.getRefreshTable("doc.cpu");

  assert.match(insertSql, /INSERT INTO doc\.cpu/);
  assert.match(insertSql, /VALUES \(\?, \?, \?, \?, \?, \?, \?, \?, \?, \?, \?, \?\);/);
  assert.equal(refreshSql, "REFRESH TABLE doc.cpu;");
});
