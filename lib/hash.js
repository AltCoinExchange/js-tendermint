'use strict';

var _slicedToArray = function () { function sliceIterator(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"]) _i["return"](); } finally { if (_d) throw _e; } } return _arr; } return function (arr, i) { if (Array.isArray(arr)) { return arr; } else if (Symbol.iterator in Object(arr)) { return sliceIterator(arr, i); } else { throw new TypeError("Invalid attempt to destructure non-iterable instance"); } }; }();

var createHash = require('create-hash');

var _require = require('./types.js'),
    VarString = _require.VarString,
    VarBuffer = _require.VarBuffer,
    VarHexBuffer = _require.VarHexBuffer,
    Time = _require.Time,
    BlockID = _require.BlockID,
    TreeHashInput = _require.TreeHashInput,
    ValidatorHashInput = _require.ValidatorHashInput,
    Int64BE = _require.Int64BE;

var blockHashFields = [['ChainID', 'chain_id', VarString], ['Height', 'height', Int64BE], ['Time', 'time', Time], ['NumTxs', 'num_txs', Int64BE], ['LastBlockID', 'last_block_id', BlockID], ['TotalTxs', 'total_txs', Int64BE], ['LastCommit', 'last_commit_hash', VarHexBuffer], ['Data', 'data_hash', VarHexBuffer], ['Validators', 'validators_hash', VarHexBuffer], ['Consensus', 'consensus_hash', VarHexBuffer], ['App', 'app_hash', VarHexBuffer], ['Results', 'last_results_hash', VarHexBuffer], ['Evidence', 'evidence_hash', VarHexBuffer]];

// sort fields by hash of name
var _iteratorNormalCompletion = true;
var _didIteratorError = false;
var _iteratorError = undefined;

try {
  for (var _iterator = blockHashFields[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
    var field = _step.value;

    field.push(ripemd160(field[0]));
  }
} catch (err) {
  _didIteratorError = true;
  _iteratorError = err;
} finally {
  try {
    if (!_iteratorNormalCompletion && _iterator.return) {
      _iterator.return();
    }
  } finally {
    if (_didIteratorError) {
      throw _iteratorError;
    }
  }
}

blockHashFields.sort(function (a, b) {
  return a[3].compare(b[3]);
});

function getBlockHash(header) {
  var hashes = blockHashFields.map(function (_ref) {
    var _ref2 = _slicedToArray(_ref, 4),
        key = _ref2[0],
        jsonKey = _ref2[1],
        type = _ref2[2],
        keyHash = _ref2[3];

    var hash = kvHash(keyHash, type, header[jsonKey], key);
    hash.key = key;
    return hash;
  });
  return treeHash(hashes).toString('hex').toUpperCase();
}

function getValidatorSetHash(validators) {
  var hashes = validators.map(getValidatorHash);
  return treeHash(hashes).toString('hex').toUpperCase();
}

function getValidatorHash(validator) {
  var bytes = ValidatorHashInput.encode(validator);
  return ripemd160(bytes);
}

function kvHash(keyHash, type, value, key) {
  var encodedValue = '';
  if (value || typeof value === 'number') {
    encodedValue = type.encode(value);
  }
  var valueHash = ripemd160(encodedValue);
  var bytes = Buffer.concat([VarBuffer.encode(keyHash), VarBuffer.encode(valueHash)]);
  return ripemd160(bytes);
}

function treeHash(hashes) {
  if (hashes.length === 1) {
    return hashes[0];
  }
  var midpoint = Math.ceil(hashes.length / 2);
  var left = treeHash(hashes.slice(0, midpoint));
  var right = treeHash(hashes.slice(midpoint));
  var hashInput = TreeHashInput.encode({ left: left, right: right });
  return ripemd160(hashInput);
}

function ripemd160(data) {
  return createHash('ripemd160').update(data).digest();
}

module.exports = {
  getBlockHash: getBlockHash,
  getValidatorHash: getValidatorHash,
  getValidatorSetHash: getValidatorSetHash,
  ripemd160: ripemd160
};