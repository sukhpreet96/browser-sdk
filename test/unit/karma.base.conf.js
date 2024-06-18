const webpackConfig = require('../../webpack.base')({
  mode: 'development',
  types: ['jasmine', 'chrome'],
  // do not replace some build env variables in unit test in order to test different build behaviors
  keepBuildEnvVariables: ['SDK_VERSION'],
})
const { getTestReportDirectory } = require('../envUtils')
const jasmineSeedReporterPlugin = require('./jasmineSeedReporterPlugin')

const reporters = ['spec', 'jasmine-seed']

const testReportDirectory = getTestReportDirectory()
if (testReportDirectory) {
  reporters.push('junit')
}

module.exports = (files) => ({
  basePath: '../..',
  files: [...files, 'packages/rum/test/toto.css'],
  frameworks: ['jasmine', 'webpack'],
  client: {
    jasmine: {
      random: true,
      stopSpecOnExpectationFailure: true,
    },
  },
  preprocessors: files.reduce((acc, file) => {
    acc[file] = ['webpack', 'sourcemap']
    return acc
  }, {}),
  reporters,
  specReporter: {
    suppressErrorSummary: true,
    suppressPassed: true,
    suppressSkipped: true,
    showBrowser: true,
  },
  junitReporter: {
    outputDir: testReportDirectory,
  },
  singleRun: true,
  webpack: {
    stats: 'minimal',
    module: webpackConfig.module,
    resolve: webpackConfig.resolve,
    target: webpackConfig.target,
    devtool: false,
    mode: 'development',
    plugins: webpackConfig.plugins,
    optimization: {
      // By default, karma-webpack creates a bundle with one entry point for each spec file, but
      // with all dependencies shared.  Our test suite does not support sharing dependencies, each
      // spec bundle should include its own copy of dependencies.
      runtimeChunk: false,
      splitChunks: false,
    },
  },
  webpackMiddleware: {
    stats: 'errors-only',
    logLevel: 'warn',
  },
  plugins: ['karma-*', jasmineSeedReporterPlugin],

  // Running tests on low performance environments (ex: BrowserStack) can block JS execution for a
  // few seconds. We need to increase those two timeout values to make sure Karma (and underlying
  // Socket.io) does not consider that the browser crashed.
  pingTimeout: 60_000,
  browserNoActivityTimeout: 60_000,
})
