module.exports = {
    root: true,    
    extends: [
      'eslint:recommended'
    ],
    "overrides": [
      {
        "files": ["**/*.ts", "**/*.tsx"],
        "env": { "browser": true, "ES2021": true, "node": true },
        "extends": [
          "eslint:recommended",
          "plugin:@typescript-eslint/eslint-recommended",
          "plugin:@typescript-eslint/recommended"
        ],
        "globals": { "Atomics": "readonly", "SharedArrayBuffer": "readonly" },
        "parser": "@typescript-eslint/parser",
        "parserOptions": {
          "ecmaFeatures": { "jsx": true },
          "ecmaVersion": 2021,
          "sourceType": "module",
          "project": "./tsconfig.json"
        },
        "plugins": ["@typescript-eslint"],
        "rules": {
          "quotes": ["error", "single"],
          "@typescript-eslint/no-explicit-any": 0
        }
      }
    ]
};