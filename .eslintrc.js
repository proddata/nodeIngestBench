module.exports = {
  env: {
    browser: false,
    es2021: true,
  },
  extends: [
    'airbnb-base',
  ],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  rules: {
    "no-console": "off",
    "quotes": "off",
    "one-var": "off",
    "one-var-declaration-per-line": "off",
    "no-inner-declarations": "off",
    "no-use-before-define": "off",
    "no-restricted-syntax": "off",
    "guard-for-in": "off",
  },
};
