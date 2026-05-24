module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  setupFiles: ["<rootDir>/tests/setup-env.ts"],
  testMatch: ["<rootDir>/tests/**/*.test.ts"],
  clearMocks: true
};
