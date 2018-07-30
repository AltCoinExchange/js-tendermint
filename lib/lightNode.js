'use strict';

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var old = require('old');
var EventEmitter = require('events');
var RpcClient = require('./rpc.js');

var _require = require('./verify.js'),
    verifyCommit = _require.verifyCommit,
    verifyCommitSigs = _require.verifyCommitSigs,
    verifyValidatorSet = _require.verifyValidatorSet,
    verify = _require.verify;

var HOUR = 60 * 60 * 1000;
var FOUR_HOURS = 4 * HOUR;
var THIRTY_DAYS = 30 * 24 * HOUR;

// TODO: support multiple peers
// (multiple connections to listen for headers,
// get current height from multiple peers before syncing,
// randomly select peer when requesting data,
// broadcast txs to many peers)

// TODO: on error, disconnect from peer and try again

// TODO: use time heuristic to ensure nodes can't DoS by
// sending fake high heights.
// (applies to getting height when getting status in `sync()`,
// and when receiving a block in `update()`)

// talks to nodes via RPC and does light-client verification
// of block headers.

var LightNode = function (_EventEmitter) {
  _inherits(LightNode, _EventEmitter);

  function LightNode(peer, state) {
    var opts = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};

    _classCallCheck(this, LightNode);

    var _this = _possibleConstructorReturn(this, (LightNode.__proto__ || Object.getPrototypeOf(LightNode)).call(this));

    _this.maxAge = opts.maxAge || THIRTY_DAYS;

    if (typeof state.header.height !== 'number') {
      throw Error('Expected state header to have a height');
    }

    // we should be able to trust this state since it was either
    // hardcoded into the client, or previously verified/stored,
    // but it doesn't hurt to do a sanity check. not required
    // for first block, since we might be deriving it from genesis
    if (state.header.height > 1 || state.commit != null) {
      verifyValidatorSet(state.validators, state.header.validators_hash);
      verifyCommit(state.header, state.commit, state.validators);
    }

    _this._state = state;

    _this.rpc = RpcClient(peer);
    _this.rpc.on('error', function (err) {
      return _this.emit('error', err);
    });
    _this.on('error', function () {
      return _this.rpc.close();
    });

    _this.handleError(_this.initialSync)().then(function () {
      return _this.emit('synced');
    });
    return _this;
  }

  _createClass(LightNode, [{
    key: 'handleError',
    value: function handleError(func) {
      var _this2 = this;

      return function () {
        for (var _len = arguments.length, args = Array(_len), _key = 0; _key < _len; _key++) {
          args[_key] = arguments[_key];
        }

        return func.call.apply(func, [_this2].concat(args)).catch(function (err) {
          return _this2.emit('error', err);
        });
      };
    }
  }, {
    key: 'state',
    value: function state() {
      // TODO: deep clone
      return this._state;
    }
  }, {
    key: 'height',
    value: function height() {
      return this._state.header.height;
    }

    // sync from current state to latest block

  }, {
    key: 'initialSync',
    value: async function initialSync() {
      // TODO: use time heuristic (see comment at top of file)
      // TODO: get tip height from multiple peers and make sure
      //       they give us similar results
      var status = await this.rpc.status();
      var tip = status.sync_info.latest_block_height;
      await this.syncTo(tip);
      this.handleError(this.subscribe)();
    }

    // binary search to find furthest block from our current state,
    // which is signed by 2/3+ voting power of our current validator set

  }, {
    key: 'syncTo',
    value: async function syncTo(nextHeight) {
      var targetHeight = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : nextHeight;

      var _ref = await this.rpc.commit({ height: nextHeight }),
          SignedHeader = _ref.SignedHeader;

      var header = SignedHeader.header,
          commit = SignedHeader.commit;


      try {
        // test if this commit is signed by 2/3+ of our old set
        // (throws if not)
        verifyCommitSigs(header, commit, this._state.validators);

        // verifiable, let's update
        await this.update(header, commit);

        // reached target
        if (nextHeight === targetHeight) return;

        // continue syncing from this point
        return this.syncTo(targetHeight);
      } catch (err) {
        // real error, not just insufficient voting power
        if (!err.insufficientVotingPower) {
          throw err;
        }

        // insufficient verifiable voting power,
        // couldn't verify this header

        var height = this.height();
        if (nextHeight === height + 1) {
          throw Error('Validator set changed too much to verify transition');
        }

        // let's try going halfway back and see if we can verify
        var midpoint = height + Math.ceil((nextHeight - height) / 2);
        return this.syncTo(midpoint, targetHeight);
      }
    }

    // start verifying new blocks as they come in

  }, {
    key: 'subscribe',
    value: async function subscribe() {
      var _this3 = this;

      var query = 'tm.event = \'NewBlockHeader\'';
      var syncing = false;
      await this.rpc.subscribe({ query: query }, this.handleError(async function (_ref2) {
        var header = _ref2.header;

        // don't start another recursive sync if we are in the middle of syncing
        if (syncing) return;
        syncing = true;
        await _this3.syncTo(header.height);
        syncing = false;
      }));
    }
  }, {
    key: 'update',
    value: async function update(header, commit) {
      var height = header.height;


      if (!height) {
        throw Error('Expected header to have height');
      }

      // make sure we aren't syncing from longer than than the unbonding period
      var prevTime = new Date(this._state.header.time).getTime();
      if (Date.now() - prevTime > this.maxAge) {
        throw Error('Our state is too old, cannot update safely');
      }

      // make sure new commit isn't too far in the future
      var nextTime = new Date(header.time).getTime();
      if (nextTime - Date.now() > FOUR_HOURS) {
        throw Error('Header time is too far in the future');
      }

      if (commit == null) {
        var res = await this.rpc.commit({ height: height });
        commit = res.SignedHeader.commit;
      }

      var validators = this._state.validators;

      var validatorSetChanged = header.validators_hash !== this._state.header.validators_hash;
      if (validatorSetChanged) {
        var _res = await this.rpc.validators({ height: height });
        validators = _res.validators;
      }

      var newState = { header: header, commit: commit, validators: validators };
      verify(this._state, newState);

      this._state = newState;
      this.emit('update', header, commit, validators);
    }
  }]);

  return LightNode;
}(EventEmitter);

module.exports = old(LightNode);