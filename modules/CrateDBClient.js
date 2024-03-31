import axios from "axios";
import https from "https";

class CrateDBClient {
  /**
   * Initializes a new instance of the CrateDBClient.
   * @param {Object} config Configuration object for the CrateDB connection.
   */
  constructor(config) {
    const protocol = config.ssl ? "https" : "http";
    const crateApi = `${protocol}://${config.host}:${config.port}/_sql`;
    const agent = config.ssl && config.rejectUnauthorized === false 
      ? new https.Agent({ rejectUnauthorized: false }) 
      : undefined;

    this.axiosInstance = axios.create({
      baseURL: crateApi,
      auth: {
        username: config.user,
        password: config.password,
      },
      ...(agent && { httpsAgent: agent }),
    });
  }

  /**
 * Executes a SQL statement against CrateDB.
 * This method can handle both single and bulk SQL executions based on the provided parameters.
 * @param {string} sqlStatement The SQL statement to execute.
 * @param {Array} [bulkArgs=[]] Optional. The arguments for bulk execution. If provided, executes a bulk statement.
 * @returns {Promise<Object>} A promise that resolves with the result of the query.
 */
async executeStatement(sqlStatement, bulkArgs = []) {
  try {
    const payload = { stmt: sqlStatement };
    
    // Add bulk arguments to the payload if any are provided.
    if (bulkArgs.length > 0) {
      payload.bulk_args = bulkArgs;
    }

    const response = await this.axiosInstance.post('', payload);
    return response.data;
  } catch (error) {
    console.error(`Error executing SQL statement:`, error);
    throw error;
  }
}
}

export default CrateDBClient;