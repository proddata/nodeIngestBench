import axios from "axios";
import https from "https";

/**
 * Creates an Axios instance configured to interact with CrateDB.
 * @param {Object} config Configuration object for the CrateDB connection.
 * @returns {AxiosInstance} Configured Axios instance.
 */
function createCrateClient(config) {
  const protocol = config.ssl ? "https" : "http";
  const crateApi = `${protocol}://${config.host}:${config.port}/_sql`;

  // Only disable certificate validation if explicitly specified in the configuration.
  // This is important for security in production environments.
  const agent = config.ssl && config.rejectUnauthorized === false ? new https.Agent({ rejectUnauthorized: false }) : undefined;

  const crateApiConfig = {
    baseURL: crateApi,
    auth: {
      username: config.user,
      password: config.password,
    },
    // Conditionally add the agent only if it's defined.
    ...(agent && { httpsAgent: agent }),
  };

  return axios.create(crateApiConfig);
}

export { createCrateClient };
