const test = require("node:test");
const assert = require("node:assert/strict");

const axios = require("axios");
const { GenericContainer } = require("testcontainers");

const sqlGenerator = require("../../modules/sqlGenerator");
const dataGenerator = require("../../modules/dataGenerator");

async function waitForSqlEndpoint(url, maxAttempts = 60) {
  for (let i = 0; i < maxAttempts; i += 1) {
    try {
      await axios.post(url, { stmt: "SELECT 1" }, { timeout: 2000 });
      return;
    } catch {
      await new Promise((resolve) => {
        setTimeout(resolve, 1000);
      });
    }
  }
  throw new Error("CrateDB SQL endpoint did not become ready in time");
}

test("can create table and insert rows against CrateDB testcontainer", { timeout: 300000 }, async (t) => {
  let container;

  try {
    container = await new GenericContainer("crate", "6.2.0")
      .withExposedPorts(4200)
      .start();
  } catch (err) {
    t.skip(`Skipping integration test (Docker/Testcontainers unavailable): ${err.message}`);
    return;
  }

  try {
    const host = container.getHost();
    const port = container.getMappedPort(4200);
    const apiUrl = `http://${host}:${port}/_sql`;
    const tableName = `doc.cpu_test_${Date.now()}`;

    await waitForSqlEndpoint(apiUrl);

    await axios.post(apiUrl, { stmt: sqlGenerator.getCreateTable(tableName, 1, 0) });

    const insertStmt = sqlGenerator.getInsert(tableName);
    const rows = dataGenerator.getCPUObjectBulkArray(3, 1);

    await axios.post(apiUrl, { stmt: insertStmt, bulk_args: rows });
    await axios.post(apiUrl, { stmt: sqlGenerator.getRefreshTable(tableName) });

    const result = await axios.post(apiUrl, {
      stmt: `SELECT COUNT(*) FROM ${tableName}`,
    });

    assert.equal(result.data.rows[0][0], 3);
    await axios.post(apiUrl, { stmt: sqlGenerator.getDropTable(tableName) });
  } finally {
    if (container) {
      await container.stop();
    }
  }
});
