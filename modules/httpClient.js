const https = require("https");
const axios = require("axios");

class HttpClient {
  constructor(host, port, ssl, user, password) {
    this.cratedbEndpoint = `${ssl ? 'https' : 'http'}://${host}:${port}/_sql`;

    const agent = new https.Agent({
      rejectUnauthorized: false,
    });

    const crateApiConfig = {
      auth: {
        username: user,
        password,
      },
      httpsAgent: agent,
    };

    // https://www.npmjs.com/package/axios#creating-an-instance
    this.client = axios.create(crateApiConfig);
  }

  bulkInsert(statement, data) {
    const body = {
      stmt: statement,
      bulk_args: data,
    };

    return this.post(body);
  }

  query(query) {
    return this.post({ stmt: query });
  }

  post(body) {
    try {
      return this.client.post(this.cratedbEndpoint, body);
    } catch (error) {
      if (error.response) {
        // The request was made and the server responded with a status code
        // that falls out of the range of 2xx
        console.log(error.response.data);
        console.log(error.response.status);
        console.log(error.response.headers);
      } else if (error.request) {
        // The request was made but no response was received
        // `error.request` is an instance of XMLHttpRequest in the browser and an instance of
        // http.ClientRequest in node.js
        console.log(error.request);
      } else {
        // Something happened in setting up the request that triggered an Error
        console.log('Error', error.message);
      }

      return null;
    }
  }
}

module.exports = HttpClient;
