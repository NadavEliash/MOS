const isProd = false;
export const environment = {
  production: isProd,
  baseUrl: isProd ? 'https://opendata.dev.molsa.gov.il/api/' : 'http://localhost:3000/api/'
};
