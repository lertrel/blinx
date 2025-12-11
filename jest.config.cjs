module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/__tests__'],
  transform: {
    '^.+\\.js$': 'babel-jest',
  },
  reporters: [
    'default',
    ['jest-junit', {
      outputDirectory: 'reports/junit',
      outputName: 'jest-junit.xml',
      ancestorSeparator: ' › ',
    }],
  ],
  collectCoverageFrom: ['lib/**/*.js', 'model/**/*.js'],
};
