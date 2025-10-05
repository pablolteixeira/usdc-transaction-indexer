const path = require('path');

module.exports = function (options) {
  return {
    ...options,
    externals: {
      crypto: 'commonjs crypto',
    },
  };
};