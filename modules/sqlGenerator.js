function getDropTable(tableName) {
  return `DROP TABLE IF EXISTS ${tableName};`;
}

function getCreateTable(tableName, shards) {
  return `CREATE TABLE IF NOT EXISTS ${tableName} (
    "tags" OBJECT(DYNAMIC) AS (
        "arch" TEXT,
        "datacenter" TEXT,
        "hostname" TEXT,
        "os" TEXT,
        "rack" TEXT,
        "region" TEXT,
        "service" TEXT,
        "service_environment" TEXT,
        "service_version" TEXT,
        "team" TEXT
    ),
    "ts" TIMESTAMP WITH TIME ZONE,
    "usage_user" INTEGER,
    "usage_system" INTEGER,
    "usage_idle" INTEGER,
    "usage_nice" INTEGER,
    "usage_iowait" INTEGER,
    "usage_irq" INTEGER,
    "usage_softirq" INTEGER,
    "usage_steal" INTEGER,
    "usage_guest" INTEGER,
    "usage_guest_nice" INTEGER
  ) CLUSTERED INTO ${shards} SHARDS
    WITH (number_of_replicas = '0');`;
}

function getNumDocs(tableName) {
  return `SELECT SUM(num_docs) num_docs`
         + ` FROM sys.shards `
         + ` WHERE schema_name || '.' || table_name = ${tableName}`;
}

function getInsert(tableName) {
  return `INSERT INTO ${tableName} (tags, ts, usage_user, usage_system, `
          + `usage_idle, usage_nice, usage_iowait, usage_irq, usage_softirq, `
          + `usage_steal, usage_guest, usage_guest_nice) `
          + `VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`;
}

function getRefreshTable(tableName) {
  return `REFRESH TABLE ${tableName};`;
}

module.exports = {
  getCreateTable,
  getDropTable,
  getNumDocs,
  getInsert,
  getRefreshTable,
};
